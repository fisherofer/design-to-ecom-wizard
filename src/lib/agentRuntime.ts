/**
 * Agent Runtime
 * =============
 * Vendor-neutral replacement for the former "Goose" module. Describes any
 * external agent runtime (Goose, Ollama-backed, MCP host, custom) the OS can
 * attach to, plus the external-instruction audit engine.
 *
 * Nothing here is provider-specific: the runtime name, endpoint and tool list
 * are supplied by the caller / discovery layer, never hardcoded.
 */

export type RuntimeCheckState = "pass" | "warn" | "fail";

export interface RuntimeTool {
  name: string;
  description: string;
  available: boolean;
}

export interface AgentRuntimeStatus {
  /** Human-readable runtime name, e.g. "Goose", "Ollama", "MCP Host". */
  runtime: string;
  connected: boolean;
  extensionOk: boolean;
  endpoint: string;
  version: string;
  tools: RuntimeTool[];
  /** True when the values are placeholders rather than a live probe. */
  isSimulated: boolean;
  checkedAt: string;
}

export interface RuntimeVerificationCheck {
  id: string;
  label: string;
  state: RuntimeCheckState;
  detail: string;
}

export interface RuntimeVerification {
  ok: boolean;
  checks: RuntimeVerificationCheck[];
  checkedAt: string;
}

export interface InstructionFinding {
  id: string;
  label: string;
  state: RuntimeCheckState;
  detail: string;
}

export interface InstructionAudit {
  score: number;
  safeToApply: boolean;
  recognized: string[];
  missing: string[];
  conflicts: string[];
  findings: InstructionFinding[];
  completionPrompt: string;
}

const REQUIRED_AREAS = [
  { label: "מטרת מוצר וקהל יעד", patterns: [/overview/i, /קהל יעד/, /מה האתר עושה/, /role:/i] },
  {
    label: "ארכיטקטורה וחוזה API",
    patterns: [
      /architecture|ארכיטקטורה/i,
      /api contract|endpoints/i,
      /fastapi|localhost:\d+|baseurl/i,
      /\/api\/|\/health/i,
    ],
  },
  { label: "מסכים וזרימות", patterns: [/screens|מסכים/i, /dashboard|tracker|editor/i] },
  { label: "רכיבי ממשק", patterns: [/components|רכיבים/i, /widget|tailwind|recharts|lucide/i] },
  {
    label: "מצבים, polling ושגיאות",
    patterns: [/polling|real-time|state/i, /שגיאות|errors|retry|backoff|interceptor/i],
  },
  { label: "RTL ו-responsive", patterns: [/rtl/i, /responsive|מובייל|grid|bento/i] },
  {
    label: "גבולות אחריות",
    patterns: [
      /מה לא לבנות|do not build/i,
      /frontend.*בלבד|frontend.*only/i,
      /frontend setup|react.*vite|frontend.*directory/i,
    ],
  },
  {
    label: "Agent Runtime ו-MCP",
    patterns: [/agent runtime|runtime|goose|ollama/i, /mcp/i, /ai generator prompts|copy.*paste.*prompt/i],
  },
] as const;

const UNSAFE_PATTERNS = [
  { label: "ניסיון לעקוף הוראות מערכת", pattern: /ignore (all|previous)|התעלם (מכל|מההוראות)|override system/i },
  { label: "בקשה לחשיפת סודות", pattern: /reveal.*(secret|token|key)|הצג.*(סוד|מפתח|טוקן)|cat\s+\.env/i },
  { label: "פעולה הרסנית ללא אישור", pattern: /rm\s+-rf|drop\s+table|delete\s+all|מחק את כל/i },
  { label: "הרצת קוד בלתי מבוקרת", pattern: /curl.+\|\s*(sh|bash)|eval\s*\(|exec\s*\(/i },
] as const;

export function auditExternalInstructions(content: string): InstructionAudit {
  const normalized = content.trim();
  const recognized = REQUIRED_AREAS.filter((area) =>
    area.patterns.some((pattern) => pattern.test(normalized)),
  ).map((area) => area.label);
  const missing = REQUIRED_AREAS.filter((area) => !recognized.includes(area.label)).map(
    (area) => area.label,
  );
  const conflicts = UNSAFE_PATTERNS.filter(({ pattern }) => pattern.test(normalized)).map(
    ({ label }) => label,
  );
  const hasAcceptanceCriteria = /acceptance|קריטריוני קבלה|definition of done/i.test(normalized);
  const hasDataExamples =
    /```(json|ts|typescript|tsx|bash|sh)|דוגמת תגובת api|mock data|example|prompt:/i.test(normalized);
  const findings: InstructionFinding[] = [
    {
      id: "scope",
      label: "כיסוי דרישות",
      state: recognized.length >= 7 ? "pass" : recognized.length >= 4 ? "warn" : "fail",
      detail: `${recognized.length}/${REQUIRED_AREAS.length} תחומי חובה זוהו`,
    },
    {
      id: "security",
      label: "בטיחות הוראות חיצוניות",
      state: conflicts.length ? "fail" : "pass",
      detail: conflicts.length
        ? `${conflicts.length} התנגשויות דורשות בדיקה ידנית`
        : "לא זוהו הוראות עוקפות או הרסניות",
    },
    {
      id: "acceptance",
      label: "קריטריוני קבלה",
      state: hasAcceptanceCriteria ? "pass" : "warn",
      detail: hasAcceptanceCriteria ? "נמצאו קריטריוני קבלה מפורשים" : "מומלץ להוסיף Definition of Done מדיד",
    },
    {
      id: "examples",
      label: "דוגמאות נתונים",
      state: hasDataExamples ? "pass" : "warn",
      detail: hasDataExamples ? "נמצאו דוגמאות API או mock" : "חסרות דוגמאות JSON לבדיקת הממשק",
    },
  ];
  const score = Math.max(
    0,
    Math.round(
      (recognized.length / REQUIRED_AREAS.length) * 80 +
        (hasAcceptanceCriteria ? 10 : 0) +
        (hasDataExamples ? 10 : 0) -
        conflicts.length * 25,
    ),
  );
  const completionPrompt = [
    "השלם את המפרט החיצוני בלי לשנות את הלוגיקה העסקית הקיימת.",
    missing.length ? `תחומים חסרים: ${missing.join(", ")}.` : "כל תחומי החובה קיימים.",
    !hasAcceptanceCriteria ? "הוסף קריטריוני קבלה מדידים לכל מסך ופעולה." : "",
    !hasDataExamples ? "הוסף דוגמאות JSON למצבי הצלחה, ריקנות ושגיאה." : "",
    "שמור על frontend כשכבת תצוגה ושליטה בלבד, RTL מלא, ואישור ידני לכל שינוי קוד או פעולה הרסנית.",
  ]
    .filter(Boolean)
    .join("\n");

  return { score, safeToApply: conflicts.length === 0, recognized, missing, conflicts, findings, completionPrompt };
}

/**
 * Builds a disconnected placeholder status for a runtime that has not been
 * probed yet. Explicitly flagged `isSimulated: true` so the UI can label it.
 */
export function createUnprobedRuntimeStatus(
  runtime: string,
  endpoint: string,
  tools: RuntimeTool[] = [],
): AgentRuntimeStatus {
  return {
    runtime,
    connected: false,
    extensionOk: false,
    endpoint,
    version: "Not detected",
    tools,
    isSimulated: true,
    checkedAt: new Date().toISOString(),
  };
}

/** Default capability surface expected from any attached agent runtime. */
export const DEFAULT_RUNTIME_TOOLS: RuntimeTool[] = [
  { name: "get_status", description: "קריאת מצב המערכת", available: true },
  { name: "scan_market", description: "הפעלת סריקת שוק", available: true },
  { name: "get_recommendations", description: "שליפת המלצות", available: true },
  { name: "run_agent", description: "הרצת סוכן בשם", available: true },
  { name: "check_health", description: "בדיקת בריאות מלאה", available: true },
  { name: "update_code", description: "יצירת שינוי קוד באישור", available: false },
];
