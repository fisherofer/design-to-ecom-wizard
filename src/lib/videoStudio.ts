/**
 * videoStudio.ts — episode production for the market video show, plus the
 * "house band": the recurring cast that presents every episode.
 *
 * What is real here: the cast roster, the episode/scene model, persistence,
 * script generation through the Lovable AI gateway (server function), and the
 * exports (Markdown shooting script, SRT captions, JSON storyboard for an
 * external renderer). Rendering audio/video pixels is NOT done in the browser
 * — the studio produces the production package, and says so.
 */
import { useCallback, useEffect, useState } from "react";
import { chatComplete } from "@/lib/chatCompletion.functions";
import { localGenerate } from "@/lib/localAiScan";
import { portableGetJson, portableSetJson } from "@/lib/portableStorage";

export const STUDIO_KEY = "ofer.videoStudio.v1";
export const STUDIO_EVENT = "ofer:video-studio-changed";

export type BandRole = "anchor" | "quant" | "skeptic" | "trader" | "comic";

export interface BandMember {
  id: string;
  name: string;
  role: BandRole;
  voice: string;        // voice id / description for the renderer
  persona: string;      // how this character speaks and what they care about
  enabled: boolean;
}

export interface Scene {
  id: string;
  beat: string;         // e.g. "Cold open", "Market recap"
  speakerId: string;
  line: string;
  seconds: number;
  bRoll?: string;       // visual direction
}

export interface Episode {
  id: string;
  title: string;
  topic: string;
  symbols: string[];
  tone: "sharp" | "calm" | "hype" | "educational";
  targetSeconds: number;
  scenes: Scene[];
  createdAt: string;
  updatedAt: string;
  modelId?: string;
  status: "draft" | "scripted" | "ready";
}

interface StudioState {
  band: BandMember[];
  episodes: Episode[];
}

function defaultBand(): BandMember[] {
  return [
    {
      id: "anchor",
      name: "Ofer Prime",
      role: "anchor",
      voice: "deep-calm-male",
      persona: "Show anchor. Opens and closes, keeps time, hands off to the others. Never speculates without a number.",
      enabled: true,
    },
    {
      id: "quant",
      name: "Delta",
      role: "quant",
      voice: "precise-female",
      persona: "The quant. Speaks in stats: volatility, expectancy, hit rate. Always cites the data source and its age.",
      enabled: true,
    },
    {
      id: "skeptic",
      name: "Vega",
      role: "skeptic",
      voice: "dry-analytic",
      persona: "The risk skeptic. Attacks every thesis, names the invalidation level and the worst case first.",
      enabled: true,
    },
    {
      id: "trader",
      name: "Tape",
      role: "trader",
      voice: "fast-energetic",
      persona: "The tape reader. Talks levels, order flow and execution — entries, stops, targets, position size.",
      enabled: true,
    },
    {
      id: "comic",
      name: "Gamma",
      role: "comic",
      voice: "bright-playful",
      persona: "Comic relief. One short punchline per segment, never at the expense of accuracy.",
      enabled: false,
    },
  ];
}

function read(): StudioState {
  const stored = portableGetJson<StudioState | null>(STUDIO_KEY, null);
  if (!stored) return { band: defaultBand(), episodes: [] };
  return {
    band: stored.band?.length ? stored.band : defaultBand(),
    episodes: stored.episodes ?? [],
  };
}

function write(state: StudioState) {
  portableSetJson(STUDIO_KEY, state);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(STUDIO_EVENT));
}

export const studio = {
  state: read,
  band: () => read().band,
  episodes: () => read().episodes,

  updateMember(id: string, patch: Partial<BandMember>) {
    const s = read();
    s.band = s.band.map((m) => (m.id === id ? { ...m, ...patch } : m));
    write(s);
    return s.band;
  },

  addMember(member: Omit<BandMember, "id">) {
    const s = read();
    s.band = [...s.band, { ...member, id: `bm_${Date.now().toString(36)}` }];
    write(s);
    return s.band;
  },

  removeMember(id: string) {
    const s = read();
    s.band = s.band.filter((m) => m.id !== id);
    write(s);
    return s.band;
  },

  saveEpisode(ep: Episode) {
    const s = read();
    const idx = s.episodes.findIndex((e) => e.id === ep.id);
    const next = { ...ep, updatedAt: new Date().toISOString() };
    s.episodes = idx >= 0 ? s.episodes.map((e) => (e.id === ep.id ? next : e)) : [next, ...s.episodes];
    write(s);
    return next;
  },

  removeEpisode(id: string) {
    const s = read();
    s.episodes = s.episodes.filter((e) => e.id !== id);
    write(s);
  },
};

export function newEpisode(partial?: Partial<Episode>): Episode {
  const now = new Date().toISOString();
  return {
    id: `ep_${Date.now().toString(36)}`,
    title: partial?.title ?? "Untitled episode",
    topic: partial?.topic ?? "",
    symbols: partial?.symbols ?? [],
    tone: partial?.tone ?? "sharp",
    targetSeconds: partial?.targetSeconds ?? 90,
    scenes: partial?.scenes ?? [],
    createdAt: now,
    updatedAt: now,
    status: "draft",
  };
}

/* ------------------------------------------------------------- scripting  */

interface ScriptLine {
  speakerId?: string;
  speaker?: string;
  beat?: string;
  line?: string;
  seconds?: number;
  bRoll?: string;
}

function coerceScenes(raw: unknown, band: BandMember[]): Scene[] {
  const fallbackId = band[0]?.id ?? "anchor";
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((item, i): Scene | null => {
      const l = item as ScriptLine;
      const text = (l.line ?? "").toString().trim();
      if (!text) return null;
      const byId = band.find((b) => b.id === l.speakerId);
      const byName = band.find((b) => b.name.toLowerCase() === String(l.speaker ?? "").toLowerCase());
      return {
        id: `sc_${i}_${Math.random().toString(36).slice(2, 6)}`,
        beat: (l.beat ?? "Segment").toString().slice(0, 60),
        speakerId: byId?.id ?? byName?.id ?? fallbackId,
        line: text,
        seconds: Math.max(2, Math.round(Number(l.seconds) || Math.min(18, Math.max(3, text.split(/\s+/).length / 2.6)))),
        bRoll: l.bRoll ? String(l.bRoll).slice(0, 160) : undefined,
      };
    })
    .filter((s): s is Scene => s !== null);
}

/** Pull the JSON scene array out of a model reply, tolerating fences and prose. */
function parseScenes(reply: string, band: BandMember[]): Scene[] {
  const cleaned = reply.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  try {
    return coerceScenes(JSON.parse(cleaned.slice(start, end + 1)), band);
  } catch {
    return [];
  }
}

export interface ScriptResult {
  ok: boolean;
  detail: string;
  scenes: Scene[];
  modelId?: string;
}

export type ScriptEngine = "cloud" | "local";

/**
 * Generate a full shooting script performed by the enabled house band.
 *
 * `engine: "local"` runs the script on the on-device model through the local
 * hub (Ollama / LM Studio / GGUF). If the hub is not running the call fails
 * with the real reason — it does not silently fall back to the cloud.
 */
export async function generateScript(
  ep: Episode,
  context?: string,
  engine: ScriptEngine = "cloud",
): Promise<ScriptResult> {
  const band = studio.band().filter((m) => m.enabled);
  if (!band.length) return { ok: false, detail: "Enable at least one house band member.", scenes: [] };
  if (!ep.topic.trim()) return { ok: false, detail: "Describe the episode topic first.", scenes: [] };

  const cast = band.map((m) => `- id="${m.id}" ${m.name} (${m.role}): ${m.persona}`).join("\n");
  const system = [
    "You are the head writer of a daily markets video show.",
    "Write a tight, factual shooting script performed by the given cast.",
    "Never invent prices, fills or statistics. If a number is not supplied in the context, speak qualitatively.",
    "Return ONLY a JSON array, no prose, no markdown fences.",
    'Each item: {"speakerId": string, "beat": string, "line": string, "seconds": number, "bRoll": string}',
  ].join(" ");

  const user = [
    `Episode title: ${ep.title}`,
    `Topic: ${ep.topic}`,
    ep.symbols.length ? `Symbols: ${ep.symbols.join(", ")}` : "",
    `Tone: ${ep.tone}`,
    `Target runtime: ${ep.targetSeconds} seconds total (sum of "seconds" must be close to this).`,
    "Cast:",
    cast,
    context ? `\nVerified context you may quote:\n${context}` : "\nNo verified market numbers were supplied — stay qualitative.",
  ]
    .filter(Boolean)
    .join("\n");

  if (engine === "local") {
    try {
      const res = await localGenerate(`${system}\n\n${user}`, undefined, { maxTokens: 2400, temperature: 0.7 });
      if (!res.ok || !res.text) {
        return { ok: false, detail: "Local model returned nothing. Is the local AI hub running with a loaded model?", scenes: [] };
      }
      const scenes = parseScenes(res.text, band);
      if (!scenes.length) return { ok: false, detail: `Local model ${res.model} did not return a usable script array.`, scenes: [] };
      return { ok: true, detail: `Script written locally by ${res.model} (${res.runtime}).`, scenes, modelId: res.model };
    } catch (e) {
      return { ok: false, detail: `Local AI unavailable: ${String(e)}`, scenes: [] };
    }
  }

  try {
    const res = await chatComplete({
      data: {
        messages: [{ role: "user", content: user }],
        system,
        mode: "auto",
        difficulty: "medium",
        temperature: 0.7,
        maxTokens: 2400,
      },
    });
    if (!res.ok) return { ok: false, detail: res.error ?? "Model call failed.", scenes: [] };

    const scenes = parseScenes(res.reply, band);
    if (!scenes.length) return { ok: false, detail: "Script came back empty.", scenes: [] };
    return { ok: true, detail: `Script written by ${res.modelId}.`, scenes, modelId: res.modelId };
  } catch (e) {
    return { ok: false, detail: `Script generation failed: ${String(e)}`, scenes: [] };
  }
}

/* --------------------------------------------------------------- exports  */

export function totalSeconds(ep: Episode) {
  return ep.scenes.reduce((s, sc) => s + sc.seconds, 0);
}

function ts(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

export function episodeToSrt(ep: Episode, band: BandMember[]) {
  let cursor = 0;
  return ep.scenes
    .map((sc, i) => {
      const from = cursor;
      cursor += sc.seconds;
      const who = band.find((b) => b.id === sc.speakerId)?.name ?? sc.speakerId;
      return `${i + 1}\n${ts(from)} --> ${ts(cursor)}\n${who}: ${sc.line}\n`;
    })
    .join("\n");
}

export function episodeToMarkdown(ep: Episode, band: BandMember[]) {
  const head = [
    `# ${ep.title}`,
    "",
    `**Topic:** ${ep.topic}`,
    `**Symbols:** ${ep.symbols.join(", ") || "—"}`,
    `**Tone:** ${ep.tone} · **Runtime:** ${totalSeconds(ep)}s (target ${ep.targetSeconds}s)`,
    ep.modelId ? `**Written by:** ${ep.modelId}` : "",
    "",
    "## Cast",
    ...band.filter((b) => b.enabled).map((b) => `- **${b.name}** (${b.role}) — voice \`${b.voice}\``),
    "",
    "## Script",
    "",
  ];
  const body = ep.scenes.map((sc, i) => {
    const who = band.find((b) => b.id === sc.speakerId)?.name ?? sc.speakerId;
    return [
      `### ${i + 1}. ${sc.beat} — ${who} (${sc.seconds}s)`,
      sc.line,
      sc.bRoll ? `> B-roll: ${sc.bRoll}` : "",
      "",
    ]
      .filter(Boolean)
      .join("\n");
  });
  return [...head, ...body].join("\n");
}

/** Renderer-ready package: cast, voices, timing and visual directions. */
export function episodeToStoryboard(ep: Episode, band: BandMember[]) {
  let cursor = 0;
  return JSON.stringify(
    {
      episodeId: ep.id,
      title: ep.title,
      totalSeconds: totalSeconds(ep),
      cast: band.filter((b) => b.enabled).map((b) => ({ id: b.id, name: b.name, role: b.role, voice: b.voice })),
      shots: ep.scenes.map((sc) => {
        const start = cursor;
        cursor += sc.seconds;
        return {
          startSeconds: start,
          endSeconds: cursor,
          beat: sc.beat,
          speakerId: sc.speakerId,
          voice: band.find((b) => b.id === sc.speakerId)?.voice ?? null,
          line: sc.line,
          bRoll: sc.bRoll ?? null,
        };
      }),
    },
    null,
    2,
  );
}

export function download(name: string, content: string, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function useStudio() {
  const [state, setState] = useState<StudioState>({ band: [], episodes: [] });
  const sync = useCallback(() => setState(read()), []);
  useEffect(() => {
    sync();
    window.addEventListener(STUDIO_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(STUDIO_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [sync]);
  return { ...state, refresh: sync };
}

/* ------------------------------------------------------------------ *
 * Narration preview (browser speech synthesis)
 * ------------------------------------------------------------------ */

export function speechAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Pick a browser voice that loosely matches the member's voice description. */
function pickVoice(hint: string | undefined): SpeechSynthesisVoice | null {
  if (!speechAvailable()) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const h = (hint ?? "").toLowerCase();
  const en = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
  const pool = en.length ? en : voices;
  const match = pool.find((v) => h && v.name.toLowerCase().includes(h.split(/[\s,]/)[0] ?? ""));
  return match ?? pool[0] ?? null;
}

/**
 * Reads the episode aloud with the browser's speech engine.
 * This is a live preview only — it produces sound, not an audio file.
 */
export function narrateEpisode(ep: Episode, band: BandMember[]): { ok: boolean; detail: string } {
  if (!speechAvailable()) return { ok: false, detail: "This browser has no speech synthesis engine." };
  if (!ep.scenes.length) return { ok: false, detail: "The episode has no scenes yet." };
  window.speechSynthesis.cancel();
  for (const sc of ep.scenes) {
    const member = band.find((b) => b.id === sc.speakerId);
    const u = new SpeechSynthesisUtterance(sc.line);
    const v = pickVoice(member?.voice);
    if (v) u.voice = v;
    u.rate = 1.02;
    u.pitch = member?.role === "comic" ? 1.15 : member?.role === "skeptic" ? 0.9 : 1;
    window.speechSynthesis.speak(u);
  }
  return { ok: true, detail: `Narrating ${ep.scenes.length} lines with the house band.` };
}

export function stopNarration(): void {
  if (speechAvailable()) window.speechSynthesis.cancel();
}

/* ------------------------------------------------------------------ *
 * Render package (offline ffmpeg pipeline)
 * ------------------------------------------------------------------ */

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "episode";

/**
 * Builds a self-contained render package: a manifest plus a shell script that
 * turns per-scene stills + narration audio into an MP4 with burned captions.
 *
 * The app does NOT render video — it has no encoder. This exports exactly what
 * an offline ffmpeg run needs, so nothing here claims a finished film.
 */
export function episodeToRenderPackage(
  ep: Episode,
  band: BandMember[],
  opts?: { width?: number; height?: number; fps?: number },
): { manifest: string; script: string; baseName: string } {
  const width = opts?.width ?? 1920;
  const height = opts?.height ?? 1080;
  const fps = opts?.fps ?? 30;
  const baseName = `${slug(ep.title)}-${ep.id.slice(0, 6)}`;

  let cursor = 0;
  const shots = ep.scenes.map((sc, i) => {
    const start = cursor;
    cursor += sc.seconds;
    const member = band.find((b) => b.id === sc.speakerId);
    return {
      index: i + 1,
      startSeconds: start,
      endSeconds: cursor,
      seconds: sc.seconds,
      beat: sc.beat,
      speaker: member?.name ?? sc.speakerId,
      voice: member?.voice ?? null,
      line: sc.line,
      bRoll: sc.bRoll ?? null,
      stillFile: `stills/shot-${String(i + 1).padStart(3, "0")}.png`,
      audioFile: `audio/shot-${String(i + 1).padStart(3, "0")}.wav`,
    };
  });

  const manifest = JSON.stringify(
    {
      episodeId: ep.id,
      title: ep.title,
      totalSeconds: totalSeconds(ep),
      video: { width, height, fps, container: "mp4", codec: "libx264" },
      audio: { codec: "aac", sampleRate: 48000 },
      captions: `${baseName}.srt`,
      cast: band.filter((b) => b.enabled).map((b) => ({ id: b.id, name: b.name, role: b.role, voice: b.voice })),
      shots,
      note: "Place the referenced stills/ and audio/ files next to this manifest, then run render.sh.",
    },
    null,
    2,
  );

  const lines = [
    "#!/usr/bin/env bash",
    "# Offline render for: " + ep.title,
    "# Requires ffmpeg. Run from the folder holding this script, stills/ and audio/.",
    "set -euo pipefail",
    "",
    'rm -rf parts && mkdir -p parts',
    "",
    ...shots.map(
      (s) =>
        `ffmpeg -y -loop 1 -i "${s.stillFile}" -i "${s.audioFile}" -t ${s.seconds} ` +
        `-vf "scale=${width}:${height},format=yuv420p,fps=${fps}" ` +
        `-c:v libx264 -preset medium -crf 20 -c:a aac -ar 48000 -shortest "parts/shot-${String(s.index).padStart(3, "0")}.mp4"`,
    ),
    "",
    'printf "file \'%s\'\\n" parts/shot-*.mp4 > parts/list.txt',
    `ffmpeg -y -f concat -safe 0 -i parts/list.txt -c copy "${baseName}.raw.mp4"`,
    `ffmpeg -y -i "${baseName}.raw.mp4" -vf "subtitles=${baseName}.srt" -c:a copy "${baseName}.mp4"`,
    "",
    `echo "Done -> ${baseName}.mp4"`,
  ];

  return { manifest, script: lines.join("\n"), baseName };
}
