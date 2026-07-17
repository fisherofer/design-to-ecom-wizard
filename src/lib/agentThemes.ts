/**
 * agentThemes — per-role visual accent map, adapted from the OFERTRADINGBOT
 * SmartChatbot AGENT_THEMES pattern. Uses semantic Tailwind palette classes
 * so it composes with the shadcn theme (no hardcoded hex).
 */
export type AgentRoleKey =
  | "coordinator"
  | "alpha"
  | "risk"
  | "whale"
  | "research"
  | "execution"
  | "default";

export interface AgentTheme {
  accent: string;      // text/icon color
  ring: string;        // ring or border accent
  bgSoft: string;      // subtle background wash
  dot: string;         // small status dot
  label: string;       // human-readable label
}

const THEMES: Record<AgentRoleKey, AgentTheme> = {
  coordinator: { accent: "text-purple-400", ring: "ring-purple-500/40", bgSoft: "bg-purple-500/5",   dot: "bg-purple-400", label: "Coordinator" },
  alpha:       { accent: "text-orange-400", ring: "ring-orange-500/40", bgSoft: "bg-orange-500/5",   dot: "bg-orange-400", label: "Alpha Hunter" },
  risk:        { accent: "text-emerald-400",ring: "ring-emerald-500/40",bgSoft: "bg-emerald-500/5",  dot: "bg-emerald-400",label: "Risk Manager" },
  whale:       { accent: "text-cyan-400",   ring: "ring-cyan-500/40",   bgSoft: "bg-cyan-500/5",     dot: "bg-cyan-400",   label: "Whale Tracker" },
  research:    { accent: "text-sky-400",    ring: "ring-sky-500/40",    bgSoft: "bg-sky-500/5",      dot: "bg-sky-400",    label: "Research" },
  execution:   { accent: "text-amber-400",  ring: "ring-amber-500/40",  bgSoft: "bg-amber-500/5",    dot: "bg-amber-400",  label: "Execution" },
  default:     { accent: "text-primary",    ring: "ring-primary/40",    bgSoft: "bg-primary/5",      dot: "bg-primary",    label: "Agent" },
};

/** Best-effort mapping from a free-form role/name to a theme key. */
export function pickAgentTheme(input: { role?: string; name?: string } = {}): AgentTheme {
  const s = `${input.role ?? ""} ${input.name ?? ""}`.toLowerCase();
  if (/coordinat|orchestrat|meta|planner/.test(s)) return THEMES.coordinator;
  if (/alpha|momentum|breakout|hunter/.test(s))    return THEMES.alpha;
  if (/risk|hedge|guard|safety/.test(s))           return THEMES.risk;
  if (/whale|smart\s*money|institution/.test(s))   return THEMES.whale;
  if (/research|scout|scan|discover/.test(s))      return THEMES.research;
  if (/execut|trader|order|fill/.test(s))          return THEMES.execution;
  return THEMES.default;
}

export const AGENT_THEMES = THEMES;
