/**
 * Cyber Defence — live security posture of the running system.
 *
 * Runs real checks (transport, response headers, credential hygiene in browser
 * storage, framing, worker, kill-switch) and exposes the hardening controls:
 * idle auto-lock and emergency halt on lock.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShieldCheck, ShieldAlert, RefreshCw, Lock, Radar, KeyRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  getCyberSettings,
  scanBrowserSecrets,
  setCyberSettings,
  startIdleWatchdog,
  useSecurityReport,
  type CheckStatus,
  type CyberSettings,
  type SecretHit,
} from "@/lib/cyberGuard";
import { getKillState, engageKillSwitch, releaseKillSwitch, useKillSwitch } from "@/lib/killSwitch";

export const Route = createFileRoute("/security")({
  head: () => ({
    meta: [
      { title: "Cyber Defence — OFERTRADINGBOT" },
      {
        name: "description",
        content:
          "Live security posture: transport, response headers, credential hygiene, idle auto-lock and emergency halt for the trading system.",
      },
      { property: "og:title", content: "Cyber Defence — OFERTRADINGBOT" },
      { property: "og:description", content: "Security audit and hardening controls for the trading system." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SecurityPage,
});

const STATUS_STYLE: Record<CheckStatus, string> = {
  pass: "border-success/40 bg-success/10 text-success",
  warn: "border-warning/40 bg-warning/10 text-warning",
  fail: "border-destructive/40 bg-destructive/10 text-destructive",
  unknown: "border-border bg-muted/20 text-muted-foreground",
};

function SecurityPage() {
  const { report, running, run } = useSecurityReport();
  const kill = useKillSwitch();
  const [settings, setSettings] = useState<CyberSettings>(() => getCyberSettings());
  const [hits, setHits] = useState<SecretHit[]>([]);

  useEffect(() => {
    setSettings(getCyberSettings());
    setHits(scanBrowserSecrets());
    return startIdleWatchdog();
  }, []);

  const score = report?.score ?? 0;
  const failed = report?.checks.filter((c) => c.status === "fail").length ?? 0;
  const warned = report?.checks.filter((c) => c.status === "warn").length ?? 0;

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <ShieldCheck className="h-6 w-6 text-primary" /> Cyber Defence
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live posture of the running system — nothing here is simulated.
          </p>
        </div>
        <Button onClick={() => void run()} disabled={running} variant="outline">
          <RefreshCw className={cn("h-4 w-4", running && "animate-spin")} /> {running ? "Scanning…" : "Re-scan"}
        </Button>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card/40 p-4">
          <div className="text-xs uppercase text-muted-foreground">Security score</div>
          <div
            className={cn(
              "mt-1 text-4xl font-bold",
              score >= 80 ? "text-success" : score >= 55 ? "text-warning" : "text-destructive",
            )}
          >
            {score}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {report ? new Date(report.ranAt).toLocaleString() : "not scanned yet"}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card/40 p-4">
          <div className="text-xs uppercase text-muted-foreground">Open findings</div>
          <div className="mt-1 text-4xl font-bold">{failed}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">{warned} warnings</div>
        </div>
        <div className="rounded-xl border border-border bg-card/40 p-4">
          <div className="text-xs uppercase text-muted-foreground">Emergency halt</div>
          <div className={cn("mt-1 text-2xl font-bold", kill.engaged ? "text-destructive" : "text-success")}>
            {kill.engaged ? "ENGAGED" : "READY"}
          </div>
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              variant={kill.engaged ? "outline" : "destructive"}
              onClick={() =>
                kill.engaged ? releaseKillSwitch() : engageKillSwitch("Manual halt from Cyber Defence", "operator")
              }
            >
              <Lock className="h-3.5 w-3.5" /> {kill.engaged ? "Release" : "Halt trading"}
            </Button>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card/40 p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Radar className="h-4 w-4 text-primary" /> Checks
        </h2>
        <div className="mt-3 grid gap-2">
          {(report?.checks ?? []).map((c) => (
            <div key={c.id} className="rounded-lg border border-border/60 bg-background/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-medium">{c.title}</div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono text-[10px] uppercase">
                    {c.category}
                  </Badge>
                  <span className={cn("rounded-full border px-2 py-0.5 text-[10px] uppercase", STATUS_STYLE[c.status])}>
                    {c.status}
                  </span>
                </div>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{c.detail}</p>
              {c.remediation && (
                <p className="mt-1 flex items-start gap-1 text-xs text-warning">
                  <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0" /> {c.remediation}
                </p>
              )}
            </div>
          ))}
          {!report && <div className="text-sm text-muted-foreground">Running first scan…</div>}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card/40 p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <KeyRound className="h-4 w-4 text-primary" /> Credential hygiene
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Scans this browser's local storage for values shaped like API keys and tokens.
          </p>
          <div className="mt-3 space-y-2">
            {hits.length === 0 && <div className="text-xs text-success">No credential-shaped values found.</div>}
            {hits.map((h) => (
              <div key={`${h.storageKey}-${h.kind}`} className="rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs">
                <div className="font-medium text-destructive">{h.kind}</div>
                <div className="font-mono text-[11px] text-muted-foreground">
                  {h.storageKey} · {h.preview}
                </div>
              </div>
            ))}
          </div>
          <Button className="mt-3" size="sm" variant="outline" onClick={() => setHits(scanBrowserSecrets())}>
            Re-scan storage
          </Button>
        </div>

        <div className="rounded-xl border border-border bg-card/40 p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Lock className="h-4 w-4 text-primary" /> Hardening
          </h2>
          <div className="mt-3 space-y-3">
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Idle auto-lock (minutes, 0 = off)</span>
              <Input
                type="number"
                min={0}
                max={720}
                className="w-24"
                value={settings.autoLockMinutes}
                onChange={(e) => setSettings(setCyberSettings({ autoLockMinutes: Number(e.target.value) || 0 }))}
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Lock engages the emergency halt</span>
              <Switch
                checked={settings.lockEngagesKillSwitch}
                onCheckedChange={(v) => setSettings(setCyberSettings({ lockEngagesKillSwitch: v }))}
              />
            </label>
            <p className="text-xs text-muted-foreground">
              Response hardening (CSP, frame-ancestors, nosniff, HSTS, referrer and permissions policy) is applied on the
              server to every response and verified by the checks above.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

// keeps the import used when the page is server-rendered without a session
void getKillState;
