# GOOSE INTEGRATION SPEC — AI Executive OS Frontend

> מסמך זה מיועד להזנה ל-Goose לצורך התאמה מלאה בין ה-Frontend לבין MCP של Goose,
> ומניעת כפילויות בבניית קוד, סקירות וטיפול בשגיאות.
> שפת UI: עברית + RTL. Stack: TanStack Start v1 + React 19 + Vite 7 + TypeScript + Tailwind v4.

---

## 1. מה האתר מכיל (Product Overview)

**AI Executive OS** — לוח בקרה מקצועי לניהול מערכת מסחר אלגוריתמית מבוססת LLM/Agents.
האתר הוא **Frontend בלבד**. כל הלוגיקה העסקית, ה-DB, ה-LLM וה-Agents רצים בצד שרת
(FastAPI מקומי על `http://localhost:8050`) או דרך Goose MCP.

### 1.1 מסכים (Routes)

| נתיב | קובץ | תפקיד |
|------|------|--------|
| `/` | `src/routes/index.tsx` | Dashboard ראשי — סטטוס מערכת, מנועים, latency, מחווני בריאות |
| `/agents` | `agents.tsx` | ניהול סוכנים (יצירה, אישור, הרצה, מעקב Meta-Agent proposals) |
| `/api-vault` | `api-vault.tsx` | ניהול מפתחות API לפי tiers (primary/fallback/emergency) ו-routing חכם |
| `/backup` | `backup.tsx` | גיבוי, ייצוא Source Bundle (zip), שחזור |
| `/code-studio` | `code-studio.tsx` | עורך קוד (Monaco-style) + Terminal pane + Save & Deploy / Revert |
| `/config` | `config.tsx` | פרמטרי תצורה עם Safe-Change Workflow (snapshot + rollback) |
| `/goose` | `goose.tsx` | סטטוס Goose, רשימת כלים, אימות אינטגרציה, prompt completion |
| `/intelligence` | `intelligence.tsx` | תובנות שוק + Recommendations מהסוכנים |
| `/personas` | `personas.tsx` | Trader Personas + Alpha Extractor |
| `/portfolio` | `portfolio.tsx` | חשיפות, P&L, charts (Recharts + TradingView widgets) |
| `/settings` | `settings.tsx` | טאבים: General, Theme, ApiProviders, Github + כפתור שמירה גלובלי |
| `/strategy` | `strategy.tsx` | הגדרת אסטרטגיות מסחר |
| `/system` | `system.tsx` | Healthcheck עמוק, Self-Repair, Docker/NPM ניהול |
| `/terminal` | `terminal.tsx` | Bash-like console מול הסוכנים |
| `/trading` | `trading.tsx` | טריידינג ידני/חצי-אוטומטי |
| `/triggers` | `triggers.tsx` | חוקי הפעלה אוטומטיים |

### 1.2 רכיבי UI מרכזיים

- `src/components/layout/AppShell.tsx` — מארז ראשי + Sidebar + TopHeader (responsive, mobile drawer)
- `src/components/layout/Sidebar.tsx`, `TopHeader.tsx`
- `src/components/chat/FloatingChat.tsx` — Chatbot צף עם **ניתוב אוטומטי ל-Goose**
- `src/components/dashboard/*` — קלפי סטטוס
- `src/components/settings/*` — GeneralTab, ThemeTab, ApiProvidersTab, GithubTab
- `src/components/agents/*`, `backup/*`, `config/*`
- `src/components/ui/*` — shadcn/ui (Radix-based) — 50+ רכיבי בסיס

---

## 2. מה הקוד מכיל (Code Structure)

```
src/
├── routes/              17 דפים (TanStack file-based routing)
├── components/          69 רכיבי .tsx
│   ├── ui/             shadcn/ui primitives — אין לערוך, יש למחזר
│   ├── layout/         AppShell, Sidebar, TopHeader
│   ├── chat/           FloatingChat (משלב Goose)
│   ├── dashboard/      קלפי סטטוס
│   ├── settings/       4 טאבים
│   └── agents|backup|config
├── lib/
│   ├── api.ts          537 שורות — Bridge ל-FastAPI (localhost:8050)
│   ├── goose.ts        150+ שורות — types, audit, Mock data, instruction validator
│   ├── agents.ts       מנהל סוכנים בצד לקוח
│   ├── agentBuilder.ts בנאי סוכנים
│   ├── modelFilters.ts פילטרים למודלים
│   ├── refreshIntervals.ts, rateLimits.ts, selfCoding.ts, sourceExport.ts
├── services/
│   └── api.ts          לקוח axios חדש לפי spec של Goose (localhost:8000)
│                       — נפרד מ-lib/api.ts (port 8050)
├── context/AppContext.tsx
├── hooks/
├── theme/tokens.ts     design tokens (semantic, RTL-aware)
├── styles.css          Tailwind v4 @theme + CSS variables
├── router.tsx
└── routes/__root.tsx
```

### 2.1 ספריות מרכזיות

- **TanStack**: `react-router` 1.168, `react-start` 1.167, `react-query` 5.83
- **UI**: כל `@radix-ui/*`, Tailwind v4, `lucide-react`, `recharts`, `react-ts-tradingview-widgets`
- **טפסים**: `react-hook-form` + `zod` + `@hookform/resolvers`
- **HTTP**: `fetch` (lib/api.ts) ו-`axios` (services/api.ts)
- **כלים**: `jszip` (Source Bundle), `sonner` (toasts), `cmdk`

---

## 3. חוזה ה-API (Backend Contract — מה Goose צריך לחשוף)

### 3.1 ה-Bridge הקיים — `http://localhost:8050` (FastAPI `api_bridge.py`)

| Method | Path | תיאור |
|--------|------|--------|
| GET  | `/health` | health ping בסיסי |
| GET  | `/system/status` | סטטוס מנועים (cloud/local), DB, latency, docker, npm |
| GET  | `/system/healthcheck` | בדיקה עמוקה: python/docker/ollama/npm versions |
| POST | `/system/repair` | self-repair מבוסס AI |
| GET  | `/vault/keys` | רשימת מפתחות API |
| POST | `/vault/keys` | הוספת מפתח |
| POST | `/vault/keys/:id` | עדכון מפתח (tier/disabled) |
| GET  | `/vault/categories` | קטגוריות (LLM/Data/Broker) |
| GET  | `/config/params` | פרמטרי תצורה |
| POST | `/config/params/:key` | Safe-Change (snapshot + rollback) |
| GET  | `/personas` | Trader personas |
| POST | `/personas/:id/extract` | הפעלת Alpha Extractor |
| GET  | `/evolution/proposals` | Meta-Agent suggestions |
| POST | `/evolution/proposals/:id/approve` | אישור הצעה |
| GET  | `/logs?level=&limit=` | לוגים |
| POST | `/chat` | Chat → LLM (fallback) |
| POST | `/docker/restart` \| `/docker/update` | Docker ops |
| POST | `/npm/check` \| `/npm/install` | NPM ops |

### 3.2 Goose MCP — endpoints שה-Frontend כבר קורא להם

| Method | Path | תיאור | מצב |
|--------|------|--------|------|
| GET  | `/api/goose/status` | סטטוס חיבור, גרסה, רשימת tools | קיים — polling כל 15s כשהצ׳אט פתוח |
| POST | `/api/goose/verify` | אימות שהאינטגרציה תקינה (checks) | קיים |
| POST | `/api/goose/chat` | צ׳אט עם `use_tools: true, approval_mode: "guarded"` | קיים — מחזיר `route` + `toolsUsed[]` |

### 3.3 כלי MCP שמוכרים ל-Frontend (לפי `MOCK_GOOSE_STATUS`)

`get_status`, `scan_market`, `get_recommendations`, `run_agent`, `check_health`, `update_code`

> כל כלי `update_code` חייב להיות במצב **guarded** (אישור ידני).

---

## 4. מה Goose צריך לבנות / מה כבר קיים — מניעת כפילויות

### 4.1 ✅ קיים ב-Frontend — Goose **לא** צריך לבנות מחדש

- כל מסכי ה-UI, ניווט, Sidebar, RTL, responsive (mobile drawer ≤768px)
- כל לקוחות ה-HTTP: `src/lib/api.ts` (port 8050) + `src/services/api.ts` (port 8000, axios + retries)
- ניהול state של מפתחות API, פרמטרים, personas, agents, proposals (mock + remote)
- FloatingChat — UI + polling + route badge (`auto · goose → engine`)
- Code Studio — עורך + Terminal pane
- Source Bundle Export (zip) ב-`/backup`
- Instruction Audit / Goose Verification UI (`src/lib/goose.ts`)
- Design tokens, Tailwind theme, toasts, error boundaries

### 4.2 🔨 Goose **כן** צריך לספק / להשלים

1. **MCP server endpoints**: `/api/goose/status`, `/api/goose/verify`, `/api/goose/chat`
   במבנה המדויק שמופיע בסעיף 3.2 — שמירה על שמות שדות (`connected`, `extensionOk`, `tools[].available`, `route`, `toolsUsed`).
2. **כלי `run_sql`** (חדש — לא קיים) במצב `guarded` עבור:
   - שמירת trades, recommendations, logs ל-PostgreSQL/SQLite
   - migrations וב-DDL רק אחרי אישור משתמש
3. **כלי `save_trade`, `save_recommendation`, `save_log`** — wrappers ל-DB writes
4. **persistence ל-Chat history** — כרגע שמור ב-`localStorage` של ה-FloatingChat;
   אם רוצים thread history רב-מכשירי — להוסיף כלי `save_chat_thread`.
5. **OAuth/refresh** למפתחות API חיצוניים (Google, Anthropic, Groq) — בצד Goose בלבד.
6. **Webhooks חתומים** לטריגרים חיצוניים — נכנסים ל-Bridge, לא ל-Frontend.

### 4.3 ❌ לא לבנות (כפילויות אסורות)

- **אין** לכפול את ה-UI ב-Goose (Goose הוא MCP server, לא frontend).
- **אין** להחליף את `src/lib/api.ts` או `src/services/api.ts` — שניהם נשארים.
- **אין** לכתוב ב-Frontend גישה ישירה ל-DB. כל שמירה תעבור דרך כלי MCP של Goose או דרך ה-Bridge.
- **אין** לאחסן סודות ב-`localStorage` או בקוד הקליינט. רק טוקני session קצרים.

---

## 5. היכן הנתונים נשמרים (Data Storage Map)

### 5.1 בצד הלקוח (Browser)

| מה | איפה | קובץ | הערות |
|----|------|------|--------|
| העדפות UI | `localStorage` | `src/theme/tokens.ts`, `ThemeTab.tsx` | theme, density |
| state של ApiProviders | `localStorage` | `ApiProvidersTab.tsx` | UI-only, לא סודות |
| הגדרות כלליות | `localStorage` | `GeneralTab.tsx`, `GithubTab.tsx` | |
| `gooseEnabled` flag | `localStorage` | `FloatingChat.tsx` | toggle ניתוב |
| Chat history | `localStorage` | `FloatingChat.tsx` | session-local |
| Agent drafts | `localStorage` | `lib/agents.ts`, `agentBuilder.ts` | טיוטות לפני שליחה |
| Refresh intervals | `localStorage` | `lib/refreshIntervals.ts` | |
| Rate limits | `localStorage` | `lib/rateLimits.ts` | |
| Backup metadata | `localStorage` | `routes/backup.tsx`, `SourceBundleCard.tsx` | |
| Self-coding logs | `localStorage` | `lib/selfCoding.ts` | |

> ⚠️ אין כרגע IndexedDB, אין Service Worker, אין cookies של session מצד הקליינט.

### 5.2 בצד השרת (אחריות Goose / Bridge)

| מה | איפה צריך להיות | אחריות |
|----|----------------|--------|
| מפתחות API אמיתיים | Vault מוצפן (Bridge) | Bridge — `/vault/keys` |
| Trades, P&L, Portfolio | PostgreSQL / SQLite | Goose `run_sql` / Bridge |
| Logs | DB + file | Bridge `/logs` |
| Personas, strategies | DB | Bridge |
| Evolution proposals | DB | Bridge `/evolution/*` |
| Code snapshots (Safe-Change) | DB / git | Bridge `/config/params/:key` |
| Source bundles (zip) | מיוצרים בלקוח (jszip) | Frontend בלבד |

### 5.3 **האם SQL נשמר דרך Goose?**

**לא כרגע.** אין כלי `run_sql` במערך `MOCK_GOOSE_STATUS.tools`.
כל שמירה ל-DB עוברת היום דרך ה-Bridge ב-`localhost:8050`.
כדי לאפשר ל-Goose לשמור SQL ישירות, יש להוסיף בצד Goose MCP:

```jsonc
// MCP tool definition
{
  "name": "run_sql",
  "description": "Execute SQL against the AI Executive OS database",
  "approval_mode": "guarded",     // אישור ידני חובה ל-DDL/DELETE/UPDATE
  "parameters": {
    "query": "string",
    "params": "array<any>",
    "dry_run": "boolean"
  }
}
```

ולעדכן את `MOCK_GOOSE_STATUS.tools` ב-`src/lib/goose.ts` כדי שה-UI יציג אותו.

---

## 6. נתיב ניתוב הצ׳אט (Chat Routing Contract)

```
User types in FloatingChat
   │
   ├── gooseEnabled?  →  /api/goose/status (polling 15s)
   │       └── connected && extensionOk?
   │             ├── YES → POST /api/goose/chat
   │             │           {messages, use_tools: true, approval_mode: "guarded"}
   │             │       response: {message, route: "goose"|"fallback", toolsUsed: string[]}
   │             │
   │             └── NO  → POST /chat (Bridge fallback)
   │
   └── gooseEnabled === false → POST /chat (Bridge LLM ישיר)
```

ה-UI מציג badge: `auto · goose → ${activeEngine}` או `auto · llm`.

---

## 7. בריאות וניטור (Health & Verification)

- `goose.tsx` קורא ל-`/api/goose/verify` ומציג צ׳קים: `pass | warn | fail`
- Instruction Audit (`auditInstructions()` ב-`lib/goose.ts`) — סורק טקסטים לפי REQUIRED_AREAS + UNSAFE_PATTERNS
- כל קריאת `request<T>` ב-`lib/api.ts` עם timeout=8s + fallback mock — האתר לעולם לא נשבר אם ה-Bridge נופל

---

## 8. הנחיות פעולה ל-Goose (Operating Rules)

1. **לעולם לא** לערוך קבצים ב-`src/components/ui/*` (shadcn primitives).
2. **לעולם לא** לערוך `src/routeTree.gen.ts` (auto-generated).
3. כל שינוי קוד → דרך כלי `update_code` עם `approval_mode: "guarded"`.
4. כל פעולת DB → דרך כלי `run_sql` (אחרי הוספתו) עם guarded.
5. שמירה על שפת UI עברית + RTL.
6. שמירה על Design tokens — לא לקודד צבעים hardcoded.
7. החזרת payloads מ-MCP ב-shape המדויק של ה-interfaces ב-`src/lib/api.ts` ו-`src/lib/goose.ts`.
8. אין לחשוף סודות, env vars, או process state בתשובות צ׳אט.
9. תמיכה ב-streaming תוספית — אם תתווסף, ה-UI יקרא ל-`/api/goose/chat` עם `Accept: text/event-stream`.

---

## 9. גרסאות וטכנולוגיות (Versions Snapshot)

- Node packages: ראה `package.json` (React 19.2, TanStack Router 1.168, Tailwind 4.2, Vite 7.3, axios 1.18, zod 3.24)
- TypeScript: 5.8 (strict)
- Deploy target: Cloudflare Workers (`@cloudflare/vite-plugin`, `wrangler.jsonc`)
- Runtime constraints: workerd — אין child_process / sharp / canvas / fs.watch

---

## 10. סיכום — מה Goose צריך לקבל כדי לעבוד מול האתר

✅ לחשוף 3 endpoints: `/api/goose/status`, `/api/goose/verify`, `/api/goose/chat`
✅ להחזיר payloads ב-shape של `GooseStatus`, `GooseVerification`, `ChatResponse`
✅ להוסיף כלי MCP חדשים אם רוצים שמירת DB ישירה: `run_sql`, `save_trade`, `save_log`
✅ לכבד approval_mode=guarded לכל פעולת כתיבה
✅ לא לכפול את ה-UI ולא להחליף את ה-Bridge הקיים — להשלים אותו
