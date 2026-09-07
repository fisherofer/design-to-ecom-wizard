/**
 * cyberGuard.ts — the system's own cyber-defence layer.
 *
 * Two jobs:
 *   1. AUDIT — run real checks against the running app (transport, security
 *      headers, secret hygiene in browser storage, clickjacking, service
 *      worker, kill-switch, session strength). Nothing here is simulated:
 *      every check inspects real runtime state and reports what it found.
 *   2. ENFORCE — an idle auto-lock that engages the emergency kill-switch and
 *      hides sensitive values after a configurable period of inactivity.
 */
import { useCallback, useEffect, useState } from "react";
import { getSyncSession } from "@/lib/cloudSync";
import { engageKillSwitch, getKillState } from "@/lib/killSwitch";
import { journal } from "@/lib/tradeJournal";

export type CheckSeverity = "critical" | "high" | "medium" | "low";
export type CheckStatus = "pass" | "warn" | "fail" | "unknown";

export interface SecurityCheck {
  id: string;
  title: string;
  category: "transport" | "secrets" | "browser" | "trading" | "data";
  severity: CheckSeverity;
  status: CheckStatus;
  detail: string;
  remediation?: string;
}

export interface SecurityReport {
  ranAt: string;
  score: number; // 0..100
  checks: SecurityCheck[];
}

const SETTINGS_KEY = "ofer.cyber.settings.v1";
const REPORT_KEY = "ofer.cyber.lastReport.v1";

export interface CyberSettings {
  autoLockMinutes: number;   // 0 = disabled
  lockEngagesKillSwitch: boolean;
  blockThirdPartyFrames: boolean;
}

const DEFAULTS: CyberSettings = {
  autoLockMinutes: 30,
  lockEngagesKillSwitch: true,
  blockThirdPartyFrames: true,
};

export function getCyberSettings(): CyberSettings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") as Partial<CyberSettings>) };
  } catch {
    return DEFAULTS;
  }
}

export function setCyberSettings(patch: Partial<CyberSettings>) {
  const next = { ...getCyberSettings(), ...patch };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("ofer:cyber-settings"));
  return next;
}

/* ---------------------------------------------------------------- secrets */

/** Heuristics for credential-shaped values sitting in browser storage. */
const SECRET_PATTERNS: { name: string; re: RegExp }[] = [
  { name: "OpenAI key", re: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { name: "Anthropic key", re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/ },
  { name: "Google API key", re: /\bAIza[0-9A-Za-z_-]{30,}\b/ },
  { name: "Alpaca key", re: /\bPK[A-Z0-9]{16,}\b/ },
  { name: "Polygon key", re: /\bpoly_[A-Za-z0-9]{16,}\b/ },
  { name: "Telegram bot token", re: /\b\d{8,12}:[A-Za-z0-9_-]{30,}\b/ },
  { name: "Slack/webhook token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: "Private key block", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
];

export interface SecretHit {
  storageKey: string;
  kind: string;
  preview: string;
}

export function scanBrowserSecrets(): SecretHit[] {
  if (typeof window === "undefined") return [];
  const hits: SecretHit[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key) continue;
    const value = localStorage.getItem(key) ?? "";
    if (value.length > 200_000) continue;
    for (const p of SECRET_PATTERNS) {
      const m = p.re.exec(value);
      if (m) {
        hits.push({ storageKey: key, kind: p.name, preview: `${m[0].slice(0, 6)}…${m[0].slice(-4)}` });
        break;
      }
    }
  }
  return hits;
}

/* ----------------------------------------------------------------- audit  */

async function checkHeaders(): Promise<SecurityCheck[]> {
  const out: SecurityCheck[] = [];
  try {
    const res = await fetch(window.location.origin + "/", { method: "GET", cache: "no-store" });
    const h = res.headers;
    const wanted: { header: string; title: string; severity: CheckSeverity; remediation: string }[] = [
      { header: "content-security-policy", title: "Content-Security-Policy", severity: "high", remediation: "Send a CSP header from the server middleware." },
      { header: "x-frame-options", title: "Clickjacking header (X-Frame-Options)", severity: "high", remediation: "Send X-Frame-Options: DENY." },
      { header: "x-content-type-options", title: "MIME sniffing protection", severity: "medium", remediation: "Send X-Content-Type-Options: nosniff." },
      { header: "referrer-policy", title: "Referrer policy", severity: "low", remediation: "Send Referrer-Policy: strict-origin-when-cross-origin." },
      { header: "strict-transport-security", title: "HSTS", severity: "medium", remediation: "Send Strict-Transport-Security on the published domain." },
    ];
    for (const w of wanted) {
      const value = h.get(w.header);
      out.push({
        id: `hdr-${w.header}`,
        title: w.title,
        category: "transport",
        severity: w.severity,
        status: value ? "pass" : "fail",
        detail: value ? `Present: ${value.slice(0, 90)}` : "Header is missing on the document response.",
        remediation: value ? undefined : w.remediation,
      });
    }
  } catch (e) {
    out.push({
      id: "hdr-probe",
      title: "Security header probe",
      category: "transport",
      severity: "medium",
      status: "unknown",
      detail: `Could not read response headers: ${String(e)}`,
    });
  }
  return out;
}

export async function runSecurityAudit(): Promise<SecurityReport> {
  const checks: SecurityCheck[] = [];

  // Transport
  const secure = typeof window !== "undefined" && window.isSecureContext;
  checks.push({
    id: "secure-context",
    title: "Encrypted transport (HTTPS / secure context)",
    category: "transport",
    severity: "critical",
    status: secure ? "pass" : "fail",
    detail: secure ? `Origin ${window.location.origin} is a secure context.` : "The app is running without a secure context — push, crypto and credentials are unsafe.",
    remediation: secure ? undefined : "Serve the app over HTTPS (or localhost) only.",
  });

  checks.push(...(await checkHeaders()));

  // Clickjacking
  let framed = false;
  try {
    framed = window.self !== window.top;
  } catch {
    framed = true;
  }
  checks.push({
    id: "framed",
    title: "Running inside a third-party frame",
    category: "browser",
    severity: "high",
    status: framed ? "warn" : "pass",
    detail: framed ? "The app is embedded in an iframe (expected inside the builder preview, dangerous anywhere else)." : "Not embedded.",
    remediation: framed ? "Reject unknown parents with a frame-ancestors CSP directive." : undefined,
  });

  // Secret hygiene
  const hits = scanBrowserSecrets();
  checks.push({
    id: "secret-hygiene",
    title: "Credentials stored in browser storage",
    category: "secrets",
    severity: "critical",
    status: hits.length ? "fail" : "pass",
    detail: hits.length
      ? `${hits.length} credential-shaped value(s): ${hits.map((h) => `${h.kind} in ${h.storageKey}`).join(", ")}`
      : "No API keys or tokens detected in local browser storage.",
    remediation: hits.length ? "Move these keys to the encrypted server vault; the browser should hold references only." : undefined,
  });

  // Session strength
  const session = getSyncSession();
  checks.push({
    id: "session-strength",
    title: "Profile session identifier strength",
    category: "data",
    severity: "medium",
    status: session.length >= 20 ? "pass" : "warn",
    detail: `Session id length ${session.length} characters.`,
    remediation: session.length >= 20 ? undefined : "Rotate the sync session so cloud rows cannot be guessed.",
  });

  // Service worker
  let swActive = false;
  try {
    swActive = Boolean(await navigator.serviceWorker?.getRegistration("/"));
  } catch {
    swActive = false;
  }
  checks.push({
    id: "service-worker",
    title: "Background worker (offline + push)",
    category: "browser",
    severity: "low",
    status: swActive ? "pass" : "warn",
    detail: swActive ? "Service worker registered." : "No service worker — background push cannot be delivered.",
    remediation: swActive ? undefined : "Register this device in Alerts → Channels → Push.",
  });

  // Notification permission
  const perm = typeof Notification !== "undefined" ? Notification.permission : "unsupported";
  checks.push({
    id: "notify-permission",
    title: "Alert delivery permission",
    category: "browser",
    severity: "low",
    status: perm === "granted" ? "pass" : "warn",
    detail: `Notification permission: ${perm}`,
  });

  // Trading safety
  const ks = getKillState();
  checks.push({
    id: "kill-switch",
    title: "Emergency kill-switch",
    category: "trading",
    severity: "high",
    status: ks.engaged ? "warn" : "pass",
    detail: ks.engaged ? `Engaged — ${ks.reason ?? "no reason given"}` : "Available and released; trading is allowed.",
  });

  // Auto-lock
  const settings = getCyberSettings();
  checks.push({
    id: "auto-lock",
    title: "Idle auto-lock",
    category: "trading",
    severity: "medium",
    status: settings.autoLockMinutes > 0 ? "pass" : "warn",
    detail: settings.autoLockMinutes > 0 ? `Locks after ${settings.autoLockMinutes} idle minutes.` : "Disabled — an unattended session can keep trading.",
    remediation: settings.autoLockMinutes > 0 ? undefined : "Enable idle auto-lock below.",
  });

  const weight: Record<CheckSeverity, number> = { critical: 30, high: 15, medium: 8, low: 3 };
  const max = checks.reduce((s, c) => s + weight[c.severity], 0) || 1;
  const lost = checks.reduce(
    (s, c) => s + (c.status === "fail" ? weight[c.severity] : c.status === "warn" ? weight[c.severity] / 2 : 0),
    0,
  );
  const report: SecurityReport = {
    ranAt: new Date().toISOString(),
    score: Math.max(0, Math.round(100 - (lost / max) * 100)),
    checks,
  };
  if (typeof window !== "undefined") localStorage.setItem(REPORT_KEY, JSON.stringify(report));
  return report;
}

export function lastReport(): SecurityReport | null {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem(REPORT_KEY) ?? "null") as SecurityReport | null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------- auto-lock  */

let idleTimer: ReturnType<typeof setTimeout> | null = null;

/** Start (or restart) the idle watchdog. Returns a cleanup function. */
export function startIdleWatchdog(): () => void {
  if (typeof window === "undefined") return () => {};
  const settings = getCyberSettings();
  const events = ["pointerdown", "keydown", "visibilitychange"];

  const trigger = () => {
    const s = getCyberSettings();
    if (s.lockEngagesKillSwitch && !getKillState().engaged) {
      engageKillSwitch(`Idle auto-lock after ${s.autoLockMinutes} minutes`, "cyber-guard");
    }
    journal({
      eventType: "KILL_SWITCH",
      severity: "warn",
      source: "risk",
      message: `Idle auto-lock engaged after ${s.autoLockMinutes} minutes of inactivity`,
    });
    window.dispatchEvent(new CustomEvent("ofer:cyber-locked"));
  };

  const arm = () => {
    if (idleTimer) clearTimeout(idleTimer);
    const mins = getCyberSettings().autoLockMinutes;
    if (mins <= 0) return;
    idleTimer = setTimeout(trigger, mins * 60_000);
  };

  if (settings.autoLockMinutes > 0) arm();
  events.forEach((e) => window.addEventListener(e, arm, { passive: true }));
  window.addEventListener("ofer:cyber-settings", arm);

  return () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = null;
    events.forEach((e) => window.removeEventListener(e, arm));
    window.removeEventListener("ofer:cyber-settings", arm);
  };
}

export function useSecurityReport() {
  const [report, setReport] = useState<SecurityReport | null>(null);
  const [running, setRunning] = useState(false);

  const run = useCallback(async () => {
    setRunning(true);
    try {
      setReport(await runSecurityAudit());
    } finally {
      setRunning(false);
    }
  }, []);

  useEffect(() => {
    setReport(lastReport());
    void run();
  }, [run]);

  return { report, running, run };
}
