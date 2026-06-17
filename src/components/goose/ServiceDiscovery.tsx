import { useEffect, useState } from "react";
import { Activity, Copy, Loader2, RefreshCw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Probe = {
  id: string;
  name: string;
  host: string;
  port: number;
  path: string;
  hint: string;
};

const DEFAULT_PROBES: Probe[] = [
  { id: "ollama", name: "Ollama", host: "localhost", port: 11434, path: "/api/tags", hint: "LLM מקומי" },
  { id: "lmstudio", name: "LM Studio", host: "localhost", port: 1234, path: "/v1/models", hint: "OpenAI-compatible" },
  { id: "hf-tgi", name: "HuggingFace TGI", host: "localhost", port: 8080, path: "/health", hint: "Text Generation" },
  { id: "goose-mcp", name: "Goose MCP", host: "localhost", port: 3000, path: "/health", hint: "MCP server" },
  { id: "goose-alt", name: "Goose (alt)", host: "localhost", port: 51000, path: "/health", hint: "MCP אלטרנטיבי" },
  { id: "fastapi", name: "FastAPI Backend", host: "localhost", port: 8000, path: "/health", hint: "Trading backend" },
  { id: "bridge", name: "Local Bridge", host: "localhost", port: 8050, path: "/health", hint: "OferTradingBot bridge" },
];

type Result = {
  state: "idle" | "probing" | "online" | "offline";
  latencyMs?: number;
  payload?: string;
};

const STORAGE_KEY = "serviceDiscovery.v1";

async function probeOne(p: Probe, timeoutMs = 2500): Promise<Result> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const url = `http://${p.host}:${p.port}${p.path}`;
  const t0 = performance.now();
  try {
    const res = await fetch(url, { signal: controller.signal, mode: "cors" });
    const latencyMs = Math.round(performance.now() - t0);
    const text = (await res.text()).slice(0, 200);
    return { state: "online", latencyMs, payload: text };
  } catch {
    // CORS-blocked endpoints often still respond → opaque fetch as liveness fallback
    try {
      await fetch(url, { mode: "no-cors", signal: controller.signal });
      return { state: "online", latencyMs: Math.round(performance.now() - t0), payload: "opaque (CORS)" };
    } catch {
      return { state: "offline" };
    }
  } finally {
    clearTimeout(timer);
  }
}

const GOOSE_PROMPT = `[SYSTEM OVERRIDE: ZERO-HARDCODING & DYNAMIC SERVICE DISCOVERY]

GOOSE — אסור hardcoded ports / .env סטטי. עבור ל-Service Discovery דינמי.

ACTION 1: צור D:\\llm\\OferTradingBot_v38_Production\\Execution\\network_discovery.py
- import socket, psutil, requests, sqlite3
- סרוק localhost לפורטים: 11434 (Ollama), 1234 (LM Studio), 8080 (HF TGI),
  3000/51000 (Goose/MCP), 8000 (FastAPI), 8050 (Bridge)
- אתר את פורט Goose/MCP דינמית ע"י psutil.process_iter על שם התהליך 'goose'
- אמת liveness: GET /api/tags ל-Ollama, /v1/models ל-LM Studio, /health לשאר
- חבר ל-quantengine.db, UPSERT לטבלת service_registry(name, host, port, status, checked_at)

ACTION 2: עדכן את launcher.py — הרץ network_discovery.py לפני FastAPI uvicorn.run

ACTION 3: הרץ: python D:\\llm\\OferTradingBot_v38_Production\\Execution\\network_discovery.py

דווח בדיוק:
"✅ [SERVICE DISCOVERY ONLINE] Hardcoding eliminated. Successfully scanned localhost, detected active AI endpoints (Ollama/Goose), and securely mapped their dynamic ports to the DB Vault."
`;

export function ServiceDiscovery() {
  const [probes, setProbes] = useState<Probe[]>(DEFAULT_PROBES);
  const [results, setResults] = useState<Record<string, Result>>({});
  const [scanning, setScanning] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { probes?: Probe[] };
        if (parsed.probes?.length) setProbes(parsed.probes);
      }
    } catch {}
  }, []);

  async function scanAll() {
    setScanning(true);
    setNotice("");
    setResults((r) => Object.fromEntries(probes.map((p) => [p.id, { state: "probing" as const, ...r[p.id] }])));
    const entries = await Promise.all(probes.map(async (p) => [p.id, await probeOne(p)] as const));
    const map = Object.fromEntries(entries);
    setResults(map);
    setScanning(false);
  }

  function saveConfig() {
    const payload = {
      probes,
      results,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    setNotice("התצורה נשמרה מקומית (localStorage: serviceDiscovery.v1)");
  }

  async function copyGoosePrompt() {
    await navigator.clipboard.writeText(GOOSE_PROMPT);
    setNotice("פרומפט Goose הועתק.");
  }

  async function copyDiscoveredJson() {
    const discovered = probes
      .filter((p) => results[p.id]?.state === "online")
      .map((p) => ({ name: p.name, host: p.host, port: p.port, path: p.path, latencyMs: results[p.id]?.latencyMs }));
    await navigator.clipboard.writeText(JSON.stringify({ discovered, scannedAt: new Date().toISOString() }, null, 2));
    setNotice("רשימת ה-endpoints הפעילים הועתקה כ-JSON.");
  }

  function updateProbe(id: string, patch: Partial<Probe>) {
    setProbes((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  const onlineCount = Object.values(results).filter((r) => r.state === "online").length;

  return (
    <section className="rounded-xl border border-border glass p-5" dir="rtl">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
            <Activity className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary">Zero-Hardcoding</p>
            <h2 className="font-display text-lg font-bold tracking-tight">סריקת פורטים ו-Service Discovery</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              בודק LLM/MCP מקומיים (Ollama, LM Studio, HuggingFace, Goose, FastAPI) ושומר תצורה דינמית.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={copyGoosePrompt}>
            <Copy /> העתק פרומפט Goose
          </Button>
          <Button variant="outline" onClick={copyDiscoveredJson} disabled={!onlineCount}>
            <Copy /> העתק JSON
          </Button>
          <Button variant="outline" onClick={saveConfig}>
            <Save /> שמור תצורה
          </Button>
          <Button onClick={scanAll} disabled={scanning}>
            {scanning ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            סרוק עכשיו
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {probes.map((p) => {
          const r = results[p.id] ?? { state: "idle" as const };
          const dotClass =
            r.state === "online"
              ? "bg-success"
              : r.state === "offline"
                ? "bg-destructive"
                : r.state === "probing"
                  ? "bg-warning animate-pulse"
                  : "bg-muted";
          return (
            <div key={p.id} className="rounded-lg border border-border bg-card/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", dotClass)} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{p.name}</div>
                    <div className="truncate font-mono text-[10px] text-muted-foreground">{p.hint}</div>
                  </div>
                </div>
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                  {r.state === "online" && `${r.latencyMs}ms`}
                  {r.state === "offline" && "offline"}
                  {r.state === "probing" && "..."}
                  {r.state === "idle" && "—"}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-[1fr_80px_1.4fr] gap-2" dir="ltr">
                <input
                  className="rounded border border-border bg-background px-2 py-1 font-mono text-xs"
                  value={p.host}
                  onChange={(e) => updateProbe(p.id, { host: e.target.value })}
                />
                <input
                  className="rounded border border-border bg-background px-2 py-1 font-mono text-xs"
                  type="number"
                  value={p.port}
                  onChange={(e) => updateProbe(p.id, { port: Number(e.target.value) || 0 })}
                />
                <input
                  className="rounded border border-border bg-background px-2 py-1 font-mono text-xs"
                  value={p.path}
                  onChange={(e) => updateProbe(p.id, { path: e.target.value })}
                />
              </div>
              {r.payload && (
                <pre className="mt-2 max-h-20 overflow-auto rounded bg-[var(--terminal-bg,#0b0b0b)] p-2 font-mono text-[10px] text-muted-foreground" dir="ltr">
                  {r.payload}
                </pre>
              )}
            </div>
          );
        })}
      </div>

      {notice && (
        <div className="mt-4 rounded-lg border border-info/30 bg-info/5 p-3 text-sm text-info">{notice}</div>
      )}
      <p className="mt-3 text-[11px] text-muted-foreground">
        הערה: דפדפנים חוסמים בקשות cross-origin ל-localhost. אם שירות מסומן offline אך פעיל — הוסף CORS
        (Access-Control-Allow-Origin) או הרץ את network_discovery.py מצד שרת.
      </p>
    </section>
  );
}
