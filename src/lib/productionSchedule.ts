/**
 * productionSchedule — event-driven production board for the video producer.
 *
 * Each slot answers three questions: when it is due, which window of events it
 * covers (from the previous programme of the same slot until production time),
 * and how the episode should be produced (length, tone, cast roles, source mix).
 *
 * Slots are computed from the clock and from the last recorded production, so
 * "what happened since the last programme" is always a real window and never a
 * guess. Nothing renders by itself: a due slot produces a build order, and the
 * resulting clip waits in the release queue for the owner's approval.
 */
import { portableGetJson, portableSetJson } from "@/lib/portableStorage";
import { useEffect, useState } from "react";
import type { SourceKind, SourceRegion } from "@/lib/newsSources";

export const SCHEDULE_KEY = "ofer.production.v1";
export const SCHEDULE_EVENT = "ofer:production-changed";

export type SlotCadence =
  | "pre_open"
  | "post_open"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "semiannual"
  | "earnings_season"
  | "year_end"
  | "year_start"
  | "breaking";

export interface ProductionSlot {
  id: string;
  label: string;
  cadence: SlotCadence;
  /** Local time of day (Jerusalem) the programme is due, HH:MM. */
  dueAt: string;
  targetSeconds: number;
  tone: "sharp" | "calm" | "hype" | "educational";
  castRoles: string[];
  regions: SourceRegion[];
  kinds: SourceKind[];
  /** Minimum number of real events required before a build order is emitted. */
  minEvents: number;
  enabled: boolean;
  lastProducedAt: string | null;
}

export interface ScheduleState {
  slots: ProductionSlot[];
  /** Compare history for the same slot before writing the script. */
  useHistory: boolean;
  /** Start producing as soon as enough material exists, without waiting for dueAt. */
  buildEarly: boolean;
}

const now = () => new Date().toISOString();

function defaultSlots(): ProductionSlot[] {
  const base: Array<Omit<ProductionSlot, "lastProducedAt">> = [
    {
      id: "pre-open",
      label: "תוכנית פתיחה — מסגירת המסחר עד הפתיחה",
      cadence: "pre_open",
      dueAt: "15:30",
      targetSeconds: 420,
      tone: "sharp",
      castRoles: ["anchor", "quant", "weather"],
      regions: ["global", "israel", "europe"],
      kinds: ["youtube", "analyst", "trading_site", "x"],
      minEvents: 3,
      enabled: true,
    },
    {
      id: "post-open",
      label: "תוכנית שעה לאחר הפתיחה",
      cadence: "post_open",
      dueAt: "17:45",
      targetSeconds: 360,
      tone: "sharp",
      castRoles: ["anchor", "quant", "skeptic", "trader"],
      regions: ["global", "israel"],
      kinds: ["trading_site", "x", "analyst"],
      minEvents: 3,
      enabled: true,
    },
    {
      id: "breaking",
      label: "מבזק — כשיש די מידע לקטע",
      cadence: "breaking",
      dueAt: "",
      targetSeconds: 120,
      tone: "sharp",
      castRoles: ["anchor", "quant"],
      regions: ["global", "israel", "europe"],
      kinds: ["x", "trading_site"],
      minEvents: 2,
      enabled: true,
    },
    {
      id: "weekly",
      label: "סיכום שבועי",
      cadence: "weekly",
      dueAt: "20:00",
      targetSeconds: 900,
      tone: "educational",
      castRoles: ["anchor", "quant", "skeptic", "weather", "guest"],
      regions: ["global", "israel", "europe"],
      kinds: ["youtube", "analyst", "trading_site", "x"],
      minEvents: 5,
      enabled: true,
    },
    {
      id: "monthly",
      label: "סיכום חודשי",
      cadence: "monthly",
      dueAt: "20:00",
      targetSeconds: 1200,
      tone: "educational",
      castRoles: ["anchor", "quant", "skeptic", "guest"],
      regions: ["global", "israel", "europe"],
      kinds: ["analyst", "trading_site", "youtube"],
      minEvents: 8,
      enabled: true,
    },
    {
      id: "quarterly",
      label: "סיכום רבעוני",
      cadence: "quarterly",
      dueAt: "20:00",
      targetSeconds: 1500,
      tone: "educational",
      castRoles: ["anchor", "quant", "skeptic"],
      regions: ["global", "israel", "europe"],
      kinds: ["analyst", "trading_site"],
      minEvents: 10,
      enabled: true,
    },
    {
      id: "semiannual",
      label: "סיכום חצי שנתי",
      cadence: "semiannual",
      dueAt: "20:00",
      targetSeconds: 1800,
      tone: "educational",
      castRoles: ["anchor", "quant", "skeptic"],
      regions: ["global", "israel", "europe"],
      kinds: ["analyst", "trading_site"],
      minEvents: 12,
      enabled: true,
    },
    {
      id: "earnings-season",
      label: "לקראת עונת הדיווחים",
      cadence: "earnings_season",
      dueAt: "18:00",
      targetSeconds: 900,
      tone: "educational",
      castRoles: ["anchor", "quant", "skeptic"],
      regions: ["global", "israel"],
      kinds: ["analyst", "trading_site", "youtube"],
      minEvents: 6,
      enabled: true,
    },
    {
      id: "year-end",
      label: "סיכום שנה",
      cadence: "year_end",
      dueAt: "20:00",
      targetSeconds: 2100,
      tone: "calm",
      castRoles: ["anchor", "quant", "skeptic", "weather", "guest"],
      regions: ["global", "israel", "europe"],
      kinds: ["analyst", "trading_site", "youtube", "x"],
      minEvents: 15,
      enabled: true,
    },
    {
      id: "year-start",
      label: "פתיחת שנה — תרחישים",
      cadence: "year_start",
      dueAt: "20:00",
      targetSeconds: 1500,
      tone: "calm",
      castRoles: ["anchor", "quant", "skeptic"],
      regions: ["global", "israel", "europe"],
      kinds: ["analyst", "youtube"],
      minEvents: 8,
      enabled: true,
    },
  ];
  return base.map((s) => ({ ...s, lastProducedAt: null }));
}

function read(): ScheduleState {
  const stored = portableGetJson<ScheduleState | null>(SCHEDULE_KEY, null);
  if (!stored) return { slots: defaultSlots(), useHistory: true, buildEarly: true };
  const defaults = defaultSlots();
  const merged = defaults.map((d) => stored.slots?.find((s) => s.id === d.id) ?? d);
  const extra = (stored.slots ?? []).filter((s) => !defaults.some((d) => d.id === s.id));
  return { slots: [...merged, ...extra], useHistory: stored.useHistory ?? true, buildEarly: stored.buildEarly ?? true };
}

function write(state: ScheduleState) {
  portableSetJson(SCHEDULE_KEY, state);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(SCHEDULE_EVENT));
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** How long a slot's coverage window is when no previous programme exists. */
function fallbackWindowMs(cadence: SlotCadence): number {
  switch (cadence) {
    case "pre_open":
    case "post_open":
      return 18 * HOUR;
    case "breaking":
      return 3 * HOUR;
    case "weekly":
      return 7 * DAY;
    case "monthly":
      return 31 * DAY;
    case "quarterly":
      return 92 * DAY;
    case "semiannual":
      return 183 * DAY;
    case "earnings_season":
      return 21 * DAY;
    case "year_end":
    case "year_start":
      return 365 * DAY;
    default:
      return DAY;
  }
}

export interface CoverageWindow {
  fromISO: string;
  toISO: string;
  hours: number;
  /** true when the window starts at the previous programme of this slot. */
  sinceLastProgramme: boolean;
}

export function coverageWindow(slot: ProductionSlot, at = new Date()): CoverageWindow {
  const to = at.getTime();
  const from = slot.lastProducedAt ? new Date(slot.lastProducedAt).getTime() : to - fallbackWindowMs(slot.cadence);
  return {
    fromISO: new Date(from).toISOString(),
    toISO: new Date(to).toISOString(),
    hours: Math.max(0, Math.round(((to - from) / HOUR) * 10) / 10),
    sinceLastProgramme: Boolean(slot.lastProducedAt),
  };
}

function minutesOfDay(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Jerusalem-local minutes of the day for a moment in time. */
function localMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(at);
  const [h, mm] = parts.split(":");
  return Number(h) * 60 + Number(mm);
}

function jerusalemParts(at: Date) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const map = new Map(fmt.formatToParts(at).map((p) => [p.type, p.value]));
  return {
    year: Number(map.get("year")),
    month: Number(map.get("month")),
    day: Number(map.get("day")),
    weekday: String(map.get("weekday")),
  };
}

export type SlotReadiness = "due" | "early_possible" | "waiting" | "disabled" | "needs_material";

export interface SlotPlan {
  slot: ProductionSlot;
  window: CoverageWindow;
  readiness: SlotReadiness;
  reason: string;
  eventsAvailable: number;
}

/**
 * Decide, for each slot, whether a build order should go out now.
 * `eventCount(window)` must return a count of REAL collected events; a slot with
 * too little material reports needs_material instead of producing filler.
 */
export function planSlots(
  state: ScheduleState,
  eventCount: (window: CoverageWindow, slot: ProductionSlot) => number,
  at = new Date(),
): SlotPlan[] {
  const nowMin = localMinutes(at);
  const { month, day, weekday } = jerusalemParts(at);

  return state.slots.map((slot) => {
    const window = coverageWindow(slot, at);
    const events = eventCount(window, slot);

    if (!slot.enabled) {
      return { slot, window, readiness: "disabled" as const, reason: "המשבצת כבויה", eventsAvailable: events };
    }

    const producedRecently = (() => {
      if (!slot.lastProducedAt) return false;
      const since = at.getTime() - new Date(slot.lastProducedAt).getTime();
      switch (slot.cadence) {
        case "pre_open":
        case "post_open":
          return since < 12 * HOUR;
        case "breaking":
          return since < 45 * MINUTE;
        case "weekly":
          return since < 5 * DAY;
        case "monthly":
          return since < 25 * DAY;
        case "quarterly":
          return since < 80 * DAY;
        case "semiannual":
          return since < 170 * DAY;
        case "earnings_season":
          return since < 20 * DAY;
        default:
          return since < 300 * DAY;
      }
    })();

    const calendarDue = (() => {
      switch (slot.cadence) {
        case "pre_open":
        case "post_open":
          return true;
        case "breaking":
          return true;
        case "weekly":
          return weekday === "Fri" || weekday === "Sat";
        case "monthly":
          return day >= 28;
        case "quarterly":
          return day >= 28 && [3, 6, 9, 12].includes(month);
        case "semiannual":
          return day >= 28 && [6, 12].includes(month);
        case "earnings_season":
          return [1, 4, 7, 10].includes(month) && day <= 10;
        case "year_end":
          return month === 12 && day >= 24;
        case "year_start":
          return month === 1 && day <= 7;
        default:
          return false;
      }
    })();

    if (events < slot.minEvents) {
      return {
        slot,
        window,
        readiness: "needs_material" as const,
        reason: `נאספו ${events} אירועים מתוך ${slot.minEvents} הנדרשים לקטע`,
        eventsAvailable: events,
      };
    }

    if (producedRecently) {
      return { slot, window, readiness: "waiting" as const, reason: "התוכנית הופקה לאחרונה", eventsAvailable: events };
    }

    const dueMin = minutesOfDay(slot.dueAt);
    const timeReached = dueMin === null ? true : nowMin >= dueMin;

    if (calendarDue && timeReached) {
      return { slot, window, readiness: "due" as const, reason: "מוכן להפקה", eventsAvailable: events };
    }
    if (state.buildEarly && calendarDue) {
      return {
        slot,
        window,
        readiness: "early_possible" as const,
        reason: "יש די מידע — אפשר להתחיל לפני הזמן",
        eventsAvailable: events,
      };
    }
    return { slot, window, readiness: "waiting" as const, reason: "טרם הגיע מועד השידור", eventsAvailable: events };
  });
}

export interface BuildOrder {
  slotId: string;
  title: string;
  topic: string;
  window: CoverageWindow;
  targetSeconds: number;
  tone: ProductionSlot["tone"];
  castRoles: string[];
  regions: SourceRegion[];
  kinds: SourceKind[];
  productionDate: string;
  compareHistory: boolean;
}

export function buildOrder(plan: SlotPlan, state: ScheduleState, recapTopic?: string): BuildOrder {
  const date = new Date().toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" });
  return {
    slotId: plan.slot.id,
    title: `${plan.slot.label} · ${date}`,
    topic:
      recapTopic?.trim() ||
      `אירועי השוק מ-${new Date(plan.window.fromISO).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" })} עד עכשיו`,
    window: plan.window,
    targetSeconds: plan.slot.targetSeconds,
    tone: plan.slot.tone,
    castRoles: plan.slot.castRoles,
    regions: plan.slot.regions,
    kinds: plan.slot.kinds,
    productionDate: now(),
    compareHistory: state.useHistory,
  };
}

export const schedule = {
  state: read,
  slots: () => read().slots,
  patchSlot(slotId: string, patch: Partial<ProductionSlot>) {
    const state = read();
    write({ ...state, slots: state.slots.map((s) => (s.id === slotId ? { ...s, ...patch, id: s.id } : s)) });
  },
  markProduced(slotId: string) {
    const state = read();
    write({ ...state, slots: state.slots.map((s) => (s.id === slotId ? { ...s, lastProducedAt: now() } : s)) });
  },
  setFlags(patch: { useHistory?: boolean; buildEarly?: boolean }) {
    write({ ...read(), ...patch });
  },
  reset() {
    write({ slots: defaultSlots(), useHistory: true, buildEarly: true });
  },
};

export function useSchedule() {
  const [state, setState] = useState<ScheduleState>(() => ({ slots: [], useHistory: true, buildEarly: true }));
  useEffect(() => {
    const sync = () => setState(read());
    sync();
    window.addEventListener(SCHEDULE_EVENT, sync);
    return () => window.removeEventListener(SCHEDULE_EVENT, sync);
  }, []);
  return state;
}
