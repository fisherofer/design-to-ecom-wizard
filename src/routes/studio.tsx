/**
 * Video Studio — write, cast and export episodes of the market show,
 * performed by the recurring house band.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Clapperboard, Download, Film, Mic2, Plus, Sparkles, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  download,
  episodeToMarkdown,
  episodeToSrt,
  episodeToStoryboard,
  generateScript,
  newEpisode,
  studio,
  totalSeconds,
  useStudio,
  type Episode,
} from "@/lib/videoStudio";

export const Route = createFileRoute("/studio")({
  head: () => ({
    meta: [
      { title: "Video Studio — OFERTRADINGBOT" },
      {
        name: "description",
        content:
          "Write, cast and export episodes of the daily markets video show with the recurring house band: script, captions and a renderer-ready storyboard.",
      },
      { property: "og:title", content: "Video Studio — OFERTRADINGBOT" },
      {
        property: "og:description",
        content: "AI-written shooting scripts performed by the house band, exported as Markdown, SRT and storyboard JSON.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StudioPage,
});

const TONES: Episode["tone"][] = ["sharp", "calm", "hype", "educational"];

function StudioPage() {
  const { band, episodes, refresh } = useStudio();
  const [draft, setDraft] = useState<Episode>(() => newEpisode());
  const [context, setContext] = useState("");
  const [writing, setWriting] = useState(false);
  const [symbolsText, setSymbolsText] = useState("");

  useEffect(() => {
    setSymbolsText(draft.symbols.join(", "));
  }, [draft.id]);

  const runtime = useMemo(() => totalSeconds(draft), [draft]);

  async function write() {
    setWriting(true);
    const res = await generateScript(draft, context.trim() || undefined);
    setWriting(false);
    if (!res.ok) {
      toast.error(res.detail);
      return;
    }
    const next: Episode = { ...draft, scenes: res.scenes, modelId: res.modelId, status: "scripted" };
    setDraft(next);
    studio.saveEpisode(next);
    refresh();
    toast.success(res.detail);
  }

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Clapperboard className="h-6 w-6 text-primary" /> Video Studio
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Scripts and storyboards for the show. Pixels and audio are rendered outside the app from the exported package.
          </p>
        </div>
        <Button variant="outline" onClick={() => setDraft(newEpisode())}>
          <Plus className="h-4 w-4" /> New episode
        </Button>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* --------------------------------------------------- episode desk */}
        <section className="space-y-4">
          <div className="rounded-xl border border-border bg-card/40 p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Film className="h-4 w-4 text-primary" /> Episode brief
            </h2>
            <div className="mt-3 grid gap-3">
              <Input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="Episode title"
              />
              <Textarea
                value={draft.topic}
                onChange={(e) => setDraft({ ...draft, topic: e.target.value })}
                placeholder="What is this episode about? e.g. 'Post-CPI reaction in mega-cap tech and what it does to our open risk.'"
                rows={3}
              />
              <div className="grid gap-3 sm:grid-cols-3">
                <Input
                  value={symbolsText}
                  onChange={(e) => {
                    setSymbolsText(e.target.value);
                    setDraft({
                      ...draft,
                      symbols: e.target.value
                        .split(/[,\s]+/)
                        .map((s) => s.trim().toUpperCase())
                        .filter(Boolean),
                    });
                  }}
                  placeholder="AAPL, NVDA"
                />
                <select
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={draft.tone}
                  onChange={(e) => setDraft({ ...draft, tone: e.target.value as Episode["tone"] })}
                >
                  {TONES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <Input
                  type="number"
                  min={20}
                  max={900}
                  value={draft.targetSeconds}
                  onChange={(e) => setDraft({ ...draft, targetSeconds: Number(e.target.value) || 90 })}
                />
              </div>
              <Textarea
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder="Verified numbers the cast may quote (optional). Anything left out stays qualitative — nothing is invented."
                rows={3}
              />
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void write()} disabled={writing}>
                  <Sparkles className={cn("h-4 w-4", writing && "animate-pulse")} />
                  {writing ? "Writing…" : "Write script"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    studio.saveEpisode(draft);
                    refresh();
                    toast.success("Episode saved");
                  }}
                >
                  Save
                </Button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">
                Shooting script{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  {draft.scenes.length} shots · {runtime}s / {draft.targetSeconds}s
                </span>
              </h2>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!draft.scenes.length}
                  onClick={() => download(`${draft.id}.md`, episodeToMarkdown(draft, band), "text/markdown")}
                >
                  <Download className="h-3.5 w-3.5" /> Script
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!draft.scenes.length}
                  onClick={() => download(`${draft.id}.srt`, episodeToSrt(draft, band))}
                >
                  <Download className="h-3.5 w-3.5" /> Captions
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!draft.scenes.length}
                  onClick={() => download(`${draft.id}.storyboard.json`, episodeToStoryboard(draft, band), "application/json")}
                >
                  <Download className="h-3.5 w-3.5" /> Storyboard
                </Button>
              </div>
            </div>

            <div className="mt-3 space-y-2">
              {draft.scenes.map((sc, i) => {
                const who = band.find((b) => b.id === sc.speakerId);
                return (
                  <div key={sc.id} className="rounded-lg border border-border/60 bg-background/40 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs font-medium text-muted-foreground">
                        {i + 1}. {sc.beat}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">
                          {who?.name ?? sc.speakerId}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">{sc.seconds}s</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => setDraft({ ...draft, scenes: draft.scenes.filter((x) => x.id !== sc.id) })}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <Textarea
                      className="mt-2 text-sm"
                      rows={2}
                      value={sc.line}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          scenes: draft.scenes.map((x) => (x.id === sc.id ? { ...x, line: e.target.value } : x)),
                        })
                      }
                    />
                    {sc.bRoll && <p className="mt-1 text-[11px] text-muted-foreground">B-roll: {sc.bRoll}</p>}
                  </div>
                );
              })}
              {!draft.scenes.length && (
                <p className="text-sm text-muted-foreground">No script yet — fill in the brief and press “Write script”.</p>
              )}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------ house band */}
        <section className="space-y-4">
          <div className="rounded-xl border border-border bg-card/40 p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Users className="h-4 w-4 text-primary" /> House band
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">The recurring cast. Disabled members are left out of scripts.</p>
            <div className="mt-3 space-y-2">
              {band.map((m) => (
                <div key={m.id} className="rounded-lg border border-border/60 bg-background/40 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium">{m.name}</div>
                      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Mic2 className="h-3 w-3" /> {m.role} · {m.voice}
                      </div>
                    </div>
                    <Switch
                      checked={m.enabled}
                      onCheckedChange={(v) => {
                        studio.updateMember(m.id, { enabled: v });
                        refresh();
                      }}
                    />
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{m.persona}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card/40 p-4">
            <h2 className="text-sm font-semibold">Saved episodes</h2>
            <div className="mt-3 space-y-2">
              {episodes.map((ep) => (
                <div key={ep.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-background/40 p-2">
                  <button className="min-w-0 flex-1 text-left" onClick={() => setDraft(ep)}>
                    <div className="truncate text-sm">{ep.title}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {ep.scenes.length} shots · {totalSeconds(ep)}s · {new Date(ep.updatedAt).toLocaleString()}
                    </div>
                  </button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => {
                      studio.removeEpisode(ep.id);
                      refresh();
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              {!episodes.length && <p className="text-sm text-muted-foreground">Nothing saved yet.</p>}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
