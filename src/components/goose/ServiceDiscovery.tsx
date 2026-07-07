import { useEffect, useState } from "react";
import { Activity, Copy, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getApiBase } from "@/lib/apiConfig";

type ServiceStatus = "online" | "offline" | "degraded" | string;

type DiscoveredService = {
  name: string;
  port: number;
  status: ServiceStatus;
  latency_ms: number | null;
};

type DiscoveryResponse = {
  status: string;
  services: DiscoveredService[];
};

const GOOSE_PROMPT = `[SYSTEM OVERRIDE: ZERO-HARDCODING & DYNAMIC SERVICE DISCOVERY]

GOOSE — אסור hardcoded ports / .env סטטי. עבור ל-Service Discovery דינמי בצד ה-Backend.

ACTION 1: צור/עדכן hub/system_discovery.py
- import socket, psutil, requests, time
- סרוק localhost לפורטים: 11434 (Ollama), 1234 (LM Studio), 8080 (HF TGI),
  3000/51000 (Goose/MCP), 8000 (FastAPI), 8050 (Bridge)
- אתר את פורט Goose/MCP דינמית ע"י psutil.process_iter על שם התהליך 'goose'
- אמת liveness + מדוד latency_ms

ACTION 2: הוסף ל-api_server.py:
  GET /api/system/discovery →
  { "status": "success", "services": [ { "name", "port", "status", "latency_ms" }, ... ] }
  עם CORS פתוח.

ACTION 3: הרץ את השרת ואשר שה-endpoint מחזיר JSON תקין.

דווח:
"✅ [SERVICE DISCOVERY ONLINE] /api/system/discovery מחזיר מיפוי דינמי של הפורטים."
`;

function resolveDiscoveryBase(): string {
  const envUrl = (import.meta.env as Record<string, string | undefined>).VITE_API_URL;
  if (envUrl && envUrl.trim()) return envUrl.trim().replace(/\/$/, "");
  return getApiBase();
}

export function ServiceDiscovery() {
  const [services, setServices] = useState<DiscoveredService[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [lastFetched, setLastFetched] = useState<string | null>(null);

  async function fetchDiscovery() {
    setLoading(true);
    setError(null);
    setNotice("");
    try {
      const url = `${resolveDiscoveryBase()}/api/system/discovery`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as DiscoveryResponse;
      setServices(Array.isArray(data.services) ? data.services : []);
      setLastFetched(new Date().toLocaleTimeString());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Discovery request failed");
      setServices([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchDiscovery();
  }, []);

  async function copyGoosePrompt() {
    await navigator.clipboard.writeText(GOOSE_PROMPT);
    setNotice("פרומפט Goose הועתק.");
  }

  const onlineCount = services.filter((s) => s.status === "online").length;

  return (
    <section className="rounded-xl border border-border glass p-5" dir="rtl">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
            <Activity className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary">Backend-Driven Discovery</p>
            <h2 className="font-display text-lg font-bold tracking-tight">Service Discovery</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              נתונים מתקבלים מ-<code className="font-mono">/api/system/discovery</code> ב-Backend. הסריקה עצמה
              מתבצעת ב-Python (אין ping מהדפדפן).
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={copyGoosePrompt}>
            <Copy /> העתק פרומפט Goose
          </Button>
          <Button onClick={fetchDiscovery} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            רענן
          </Button>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between text-[11px] font-mono text-muted-foreground" dir="ltr">
        <span>{onlineCount}/{services.length} online</span>
        {lastFetched && <span>updated {lastFetched}</span>}
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          Discovery failed: {error}
        </div>
      )}

      <div className="mt-3 overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm" dir="ltr">
          <thead className="bg-card/40 text-[10px] uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-mono">Service</th>
              <th className="px-3 py-2 text-left font-mono">Port</th>
              <th className="px-3 py-2 text-left font-mono">Status</th>
              <th className="px-3 py-2 text-left font-mono">Latency</th>
            </tr>
          </thead>
          <tbody>
            {services.length === 0 && !loading && !error && (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-xs text-muted-foreground">
                  אין נתונים.
                </td>
              </tr>
            )}
            {services.map((s) => {
              const dot =
                s.status === "online"
                  ? "bg-success"
                  : s.status === "offline"
                    ? "bg-destructive"
                    : "bg-warning";
              return (
                <tr key={`${s.name}-${s.port}`} className="border-t border-border">
                  <td className="px-3 py-2 font-semibold">{s.name}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{s.port}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-2">
                      <span className={cn("h-2.5 w-2.5 rounded-full", dot)} />
                      <span className="font-mono text-xs">{s.status}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                    {typeof s.latency_ms === "number" ? `${s.latency_ms} ms` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {notice && (
        <div className="mt-4 rounded-lg border border-info/30 bg-info/5 p-3 text-sm text-info">{notice}</div>
      )}
    </section>
  );
}
