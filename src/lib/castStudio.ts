/**
 * castStudio — character (cast) management and the pending-release video queue.
 *
 * Characters extend the video studio band: each one has a role, a voice hint,
 * a persona brief and optional guest rules (e.g. "joins when fear & greed is
 * extreme"). Rendered videos wait in the queue until the owner approves
 * distribution per channel; only then may the local copy be deleted.
 *
 * Everything is stored locally through portableStorage — no cloud writes, no
 * invented data: an empty queue stays empty until a real render is registered.
 */
import { portableGetJson, portableSetJson } from "@/lib/portableStorage";
import { useEffect, useState } from "react";

export const CAST_KEY = "ofer.cast.v1";
export const CAST_EVENT = "ofer:cast-changed";

export type CastRole = "anchor" | "quant" | "skeptic" | "trader" | "comic" | "weather" | "guest";

/** When a guest character should be invited into an episode. */
export type GuestTrigger =
  | "always"
  | "fear_extreme"
  | "greed_extreme"
  | "high_volatility"
  | "strong_uptrend"
  | "strong_downtrend"
  | "manual";

export interface CastMember {
  id: string;
  name: string;
  role: CastRole;
  voice: string;
  persona: string;
  language: "he" | "en";
  guest: boolean;
  trigger: GuestTrigger;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type QueueStatus = "queued" | "rendering" | "awaiting_approval" | "approved" | "distributed" | "deletable";

export interface QueuedVideo {
  id: string;
  title: string;
  slotId: string;
  episodeId?: string;
  clipPath?: string;
  productionDate: string;
  seconds: number;
  status: QueueStatus;
  approvedChannels: string[];
  distributedChannels: string[];
  note?: string;
  createdAt: string;
  updatedAt: string;
}

interface CastState {
  cast: CastMember[];
  queue: QueuedVideo[];
  channels: string[];
}

const now = () => new Date().toISOString();
const id = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function defaultCast(): CastMember[] {
  const base: Array<Omit<CastMember, "id" | "createdAt" | "updatedAt">> = [
    {
      name: "עופר אנקור",
      role: "anchor",
      voice: "he-IL male, calm authority",
      persona: "מנחה הפרק, פותח באירועים המרכזיים ומחבר בין הכתבות.",
      language: "he",
      guest: false,
      trigger: "always",
      enabled: true,
    },
    {
      name: "קוונט",
      role: "quant",
      voice: "he-IL neutral, fast",
      persona: "מציג מספרים בלבד: תשואות, סטיות, נזילות, ומה שלא ידוע נאמר במפורש.",
      language: "he",
      guest: false,
      trigger: "always",
      enabled: true,
    },
    {
      name: "הספקן",
      role: "skeptic",
      voice: "he-IL male, dry",
      persona: "מאתגר כל תזה, מחפש את הסיכון ואת מה שחסר בנתונים.",
      language: "he",
      guest: false,
      trigger: "always",
      enabled: true,
    },
    {
      name: "חזאית הבורסה",
      role: "weather",
      voice: "he-IL female, bright",
      persona:
        "מגישה 'תחזית מזג אוויר' לשוק: סערות, בהירות ולחות לפי תנודתיות, מדד הפחד והחמדנות ומגמת המחירים.",
      language: "he",
      guest: false,
      trigger: "always",
      enabled: true,
    },
    {
      name: "אורח מוזיקלי",
      role: "guest",
      voice: "he-IL singer",
      persona: "מופיע בסיום התוכנית כשמדד הפחד והחמדנות בקיצון, עם קטע קצר שמתאים למצב השוק.",
      language: "he",
      guest: true,
      trigger: "fear_extreme",
      enabled: true,
    },
  ];
  return base.map((m) => ({ ...m, id: id(), createdAt: now(), updatedAt: now() }));
}

function defaultChannels(): string[] {
  return ["YouTube", "Telegram", "X", "Instagram", "TikTok"];
}

function read(): CastState {
  const stored = portableGetJson<CastState | null>(CAST_KEY, null);
  if (!stored) return { cast: defaultCast(), queue: [], channels: defaultChannels() };
  return {
    cast: stored.cast?.length ? stored.cast : defaultCast(),
    queue: stored.queue ?? [],
    channels: stored.channels?.length ? stored.channels : defaultChannels(),
  };
}

function write(state: CastState) {
  portableSetJson(CAST_KEY, state);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CAST_EVENT));
}

export const cast = {
  state: read,
  members: () => read().cast,
  queue: () => read().queue,
  channels: () => read().channels,

  create(partial?: Partial<CastMember>): CastMember {
    const member: CastMember = {
      id: id(),
      name: partial?.name?.trim() || "דמות חדשה",
      role: partial?.role ?? "guest",
      voice: partial?.voice ?? "",
      persona: partial?.persona ?? "",
      language: partial?.language ?? "he",
      guest: partial?.guest ?? true,
      trigger: partial?.trigger ?? "manual",
      enabled: partial?.enabled ?? true,
      createdAt: now(),
      updatedAt: now(),
    };
    const state = read();
    write({ ...state, cast: [member, ...state.cast] });
    return member;
  },

  update(memberId: string, patch: Partial<CastMember>) {
    const state = read();
    write({
      ...state,
      cast: state.cast.map((m) => (m.id === memberId ? { ...m, ...patch, id: m.id, updatedAt: now() } : m)),
    });
  },

  remove(memberId: string) {
    const state = read();
    write({ ...state, cast: state.cast.filter((m) => m.id !== memberId) });
  },

  setChannels(channels: string[]) {
    const state = read();
    write({ ...state, channels: channels.map((c) => c.trim()).filter(Boolean) });
  },

  /** Register a rendered (or queued) video that waits for the owner's approval. */
  enqueue(input: {
    title: string;
    slotId: string;
    episodeId?: string;
    clipPath?: string;
    productionDate?: string;
    seconds?: number;
    note?: string;
    status?: QueueStatus;
  }): QueuedVideo {
    const item: QueuedVideo = {
      id: id(),
      title: input.title.trim() || "פרק ללא שם",
      slotId: input.slotId,
      episodeId: input.episodeId,
      clipPath: input.clipPath,
      productionDate: input.productionDate ?? now(),
      seconds: input.seconds ?? 0,
      status: input.status ?? "awaiting_approval",
      approvedChannels: [],
      distributedChannels: [],
      note: input.note,
      createdAt: now(),
      updatedAt: now(),
    };
    const state = read();
    write({ ...state, queue: [item, ...state.queue] });
    return item;
  },

  patchQueue(itemId: string, patch: Partial<QueuedVideo>) {
    const state = read();
    write({
      ...state,
      queue: state.queue.map((q) => (q.id === itemId ? { ...q, ...patch, id: q.id, updatedAt: now() } : q)),
    });
  },

  toggleChannelApproval(itemId: string, channel: string) {
    const state = read();
    write({
      ...state,
      queue: state.queue.map((q) => {
        if (q.id !== itemId) return q;
        const approved = q.approvedChannels.includes(channel)
          ? q.approvedChannels.filter((c) => c !== channel)
          : [...q.approvedChannels, channel];
        return {
          ...q,
          approvedChannels: approved,
          status: approved.length ? "approved" : "awaiting_approval",
          updatedAt: now(),
        };
      }),
    });
  },

  markDistributed(itemId: string) {
    const state = read();
    write({
      ...state,
      queue: state.queue.map((q) =>
        q.id === itemId
          ? {
              ...q,
              distributedChannels: [...new Set([...q.distributedChannels, ...q.approvedChannels])],
              status: q.approvedChannels.length ? "deletable" : q.status,
              updatedAt: now(),
            }
          : q,
      ),
    });
  },

  removeQueued(itemId: string) {
    const state = read();
    write({ ...state, queue: state.queue.filter((q) => q.id !== itemId) });
  },
};

/** Which guest characters should join, given the current market reading. */
export function inviteGuests(
  members: CastMember[],
  reading: { fearGreed?: number | null; volatility?: "low" | "normal" | "high" | null; trend?: "up" | "down" | "flat" | null },
): CastMember[] {
  return members.filter((m) => {
    if (!m.enabled) return false;
    if (!m.guest) return true;
    switch (m.trigger) {
      case "always":
        return true;
      case "fear_extreme":
        return reading.fearGreed !== null && reading.fearGreed !== undefined && reading.fearGreed <= 25;
      case "greed_extreme":
        return reading.fearGreed !== null && reading.fearGreed !== undefined && reading.fearGreed >= 75;
      case "high_volatility":
        return reading.volatility === "high";
      case "strong_uptrend":
        return reading.trend === "up";
      case "strong_downtrend":
        return reading.trend === "down";
      default:
        return false;
    }
  });
}

export function useCast() {
  const [state, setState] = useState<CastState>(() => ({ cast: [], queue: [], channels: [] }));
  useEffect(() => {
    const sync = () => setState(read());
    sync();
    window.addEventListener(CAST_EVENT, sync);
    return () => window.removeEventListener(CAST_EVENT, sync);
  }, []);
  return state;
}
