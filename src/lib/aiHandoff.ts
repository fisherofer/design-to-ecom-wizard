/**
 * AI Handoff Export
 * =================
 * מייצר חבילת מידע מלאה על האתר עבור מערכות AI חיצוניות (Goose, Ollama,
 * HuggingFace, LM Studio, OpenWebUI, וכו'). החבילה כוללת מפת מסלולים,
 * endpoints, מפתחות localStorage, תצורת service-discovery, וסיכום של ה-spec
 * כדי שה-AI יוכל להבין מה האתר עושה ומה נדרש ממנו, בלי לקרוא את כל המאגר.
 */

import SPEC_RAW from "../../GOOSE_INTEGRATION_SPEC.md?raw";

export const ROUTES: Array<{ path: string; title: string; purpose: string }> = [
  { path: "/", title: "Dashboard", purpose: "סטטוס מערכת, KPI, התראות" },
  { path: "/agents", title: "Agents", purpose: "ניהול סוכני AI ותצורתם" },
  { path: "/api-vault", title: "API Vault", purpose: "ניהול מפתחות API בצורה מאובטחת (localStorage)" },
  { path: "/backup", title: "Backup", purpose: "ייצוא/ייבוא של מצב הקוד והתצורה" },
  { path: "/code-studio", title: "Code Studio", purpose: "עורך קוד עם guarded approval ל-Goose" },
  { path: "/config", title: "Config", purpose: "תצורת מערכת כללית" },
  { path: "/goose", title: "Goose Control", purpose: "בקרת MCP, service discovery, audit, AI handoff" },
  { path: "/intelligence", title: "Intelligence", purpose: "תובנות שוק וסנטימנט" },
  { path: "/personas", title: "Personas", purpose: "פרסונות צ'אט" },
  { path: "/portfolio", title: "Portfolio", purpose: "תיק נכסים ומעקב" },
  { path: "/settings", title: "Settings", purpose: "העדפות, ערכת נושא, רענון" },
  { path: "/strategy", title: "Strategy", purpose: "אסטרטגיות מסחר" },
  { path: "/system", title: "System", purpose: "סטטוס שרת, בריאות, לוגים" },
  { path: "/terminal", title: "Terminal", purpose: "מסוף פקודות אינטראקטיבי" },
  { path: "/trading", title: "Trading", purpose: "ביצוע עסקאות וניהול הזמנות" },
  { path: "/triggers", title: "Triggers", purpose: "טריגרים והתראות" },
];

export const ENDPOINTS = {
  bridge: {
    base: "http://localhost:8050",
    routes: [
      "GET  /system/status",
      "GET  /system/healthcheck",
      "GET  /vault/keys",
      "POST /vault/keys",
      "GET  /personas",
      "POST /chat",
      "GET  /docker/containers",
      "GET  /npm/packages",
    ],
  },
  fastapi: {
    base: "http://localhost:8000",
    routes: ["GET /health", "POST /trade"],
  },
  goose_mcp: {
    base: "http://localhost:51000 (or 3000)",
    routes: [
      "GET  /api/goose/status",
      "POST /api/goose/verify",
      "POST /api/goose/chat   { use_tools, approval_mode: 'guarded' }",
    ],
    tools: [
      "get_status", "scan_market", "get_recommendations",
      "run_agent", "check_health", "update_code (guarded)",
    ],
  },
};

export const LOCAL_STORAGE_KEYS: Array<{ key: string; purpose: string }> = [
  { key: "theme", purpose: "ערכת נושא light/dark" },
  { key: "apiKeys.v1", purpose: "API Vault — מפתחות חיצוניים" },
  { key: "gooseEnabled", purpose: "האם Goose פעיל לניתוב צ'אט" },
  { key: "chat.history", purpose: "היסטוריית צ'אט בדפדפן" },
  { key: "agents.drafts", purpose: "טיוטות סוכנים" },
  { key: "refresh.intervals", purpose: "מרווחי polling" },
  { key: "rateLimits.v1", purpose: "מצב rate-limit" },
  { key: "backup.meta", purpose: "מטא-נתוני גיבוי" },
  { key: "selfCoding.logs", purpose: "לוגים של עדכוני קוד" },
  { key: "serviceDiscovery.v1", purpose: "תצורת פורטים שזוהו דינמית" },
];

export const TECH_STACK = {
  framework: "TanStack Start v1 + React 19",
  build: "Vite 7",
  styling: "Tailwind v4 (CSS @theme tokens)",
  language: "TypeScript strict",
  routing: "File-based src/routes/*",
  ui: "shadcn/ui + Radix",
  http: "axios + fetch",
  language_ui: "עברית, RTL",
};

export const AI_TARGETS = ["goose", "ollama", "huggingface", "lmstudio", "openwebui", "generic"] as const;
export type AiTarget = (typeof AI_TARGETS)[number];

const TARGET_LABELS: Record<AiTarget, string> = {
  goose: "Goose (MCP)",
  ollama: "Ollama (localhost:11434)",
  huggingface: "HuggingFace TGI / Inference",
  lmstudio: "LM Studio (localhost:1234)",
  openwebui: "Open WebUI",
  generic: "AI כללי",
};

function readServiceDiscovery(): unknown {
  try {
    const raw = localStorage.getItem("serviceDiscovery.v1");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export interface AiHandoffBundle {
  meta: {
    type: "AI_HANDOFF";
    target: AiTarget;
    targetLabel: string;
    timestamp: string;
    app: string;
    language: string;
  };
  techStack: typeof TECH_STACK;
  routes: typeof ROUTES;
  endpoints: typeof ENDPOINTS;
  localStorage: typeof LOCAL_STORAGE_KEYS;
  serviceDiscovery: unknown;
  rules: string[];
  spec: string;
  prompt: string;
}

function promptFor(target: AiTarget): string {
  const base = `אתה מתחבר ל-Frontend של "AI Executive OS / OferTradingBot Hub".
ה-UI בעברית עם RTL. אסור לערוך src/routeTree.gen.ts או src/ui/*.
כל שינוי קוד עובר דרך update_code עם approval_mode='guarded'.
כל DB write דרך wrapper guarded (save_trade / save_recommendation / save_log).
אל תחשוף secrets. אל תוסיף streaming אם ה-UI לא תומך.
המטרה שלך: לקרוא את spec, routes, endpoints ו-localStorage שבחבילה הזו,
ולהבין בדיוק מה כבר קיים בצד הלקוח לפני שאתה מציע קוד חדש — כדי למנוע כפילויות.`;

  const extras: Record<AiTarget, string> = {
    goose: "השתמש ב-MCP tools הקיימים (get_status, scan_market, ...). update_code תמיד guarded.",
    ollama: "אתה רץ מקומית מול /api/chat. אין לך גישה ל-FS של המשתמש; החזר JSON/Markdown שיוצג ב-FloatingChat.",
    huggingface: "החזר תשובות קצרות בעברית. אל תניח גישה לכלים — אתה Inference בלבד אלא אם הוגדר MCP bridge.",
    lmstudio: "אתה OpenAI-compatible ב-:1234/v1. אל תניח tools אלא אם נקראת מ-bridge עם tool_choice.",
    openwebui: "אתה proxy מול מודלים. כבד את ה-spec ואת ה-route map כדי לא להציע כפילות UI.",
    generic: "השתמש בחבילה הזו כקונטקסט יחיד. אל תמציא endpoints שלא ברשימה.",
  };

  return `${base}\n\nהוראות ייעודיות ל-${TARGET_LABELS[target]}:\n${extras[target]}`;
}

export function buildBundle(target: AiTarget): AiHandoffBundle {
  return {
    meta: {
      type: "AI_HANDOFF",
      target,
      targetLabel: TARGET_LABELS[target],
      timestamp: new Date().toISOString(),
      app: "OferTradingBot Hub / AI Executive OS",
      language: "he-IL",
    },
    techStack: TECH_STACK,
    routes: ROUTES,
    endpoints: ENDPOINTS,
    localStorage: LOCAL_STORAGE_KEYS,
    serviceDiscovery: readServiceDiscovery(),
    rules: [
      "אל תערוך src/routeTree.gen.ts",
      "אל תערוך src/ui/* ידנית",
      "כל code change דרך update_code (guarded)",
      "כל DB write דרך wrapper guarded",
      "UI בעברית + RTL בלבד",
      "אל תקודד צבעים hex — השתמש ב-tokens",
      "אל תחשוף secrets",
    ],
    spec: SPEC_RAW,
    prompt: promptFor(target),
  };
}

export function bundleToMarkdown(b: AiHandoffBundle): string {
  const lines: string[] = [];
  lines.push(`# AI Handoff — ${b.meta.app}`);
  lines.push(`> יעד: **${b.meta.targetLabel}** · נוצר: ${b.meta.timestamp}`);
  lines.push("");
  lines.push("## Prompt");
  lines.push("```");
  lines.push(b.prompt);
  lines.push("```");
  lines.push("");
  lines.push("## Tech Stack");
  Object.entries(b.techStack).forEach(([k, v]) => lines.push(`- **${k}**: ${v}`));
  lines.push("");
  lines.push("## Routes");
  b.routes.forEach((r) => lines.push(`- \`${r.path}\` — **${r.title}** — ${r.purpose}`));
  lines.push("");
  lines.push("## Endpoints");
  Object.entries(b.endpoints).forEach(([name, e]) => {
    lines.push(`### ${name} — \`${(e as { base: string }).base}\``);
    (e as { routes: string[] }).routes.forEach((r) => lines.push(`- \`${r}\``));
    if ("tools" in e) {
      lines.push(`- tools: ${(e as { tools: string[] }).tools.join(", ")}`);
    }
  });
  lines.push("");
  lines.push("## localStorage Keys");
  b.localStorage.forEach((s) => lines.push(`- \`${s.key}\` — ${s.purpose}`));
  lines.push("");
  lines.push("## Service Discovery (snapshot)");
  lines.push("```json");
  lines.push(JSON.stringify(b.serviceDiscovery, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("## Rules");
  b.rules.forEach((r) => lines.push(`- ${r}`));
  lines.push("");
  lines.push("---");
  lines.push("## Full Spec");
  lines.push(b.spec);
  return lines.join("\n");
}

export function downloadText(filename: string, content: string, mime = "text/plain") {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
