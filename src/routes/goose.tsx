import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bird,
  CheckCircle2,
  ClipboardCheck,
  Code2,
  Copy,
  Loader2,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  auditExternalInstructions,
  MOCK_GOOSE_STATUS,
  type GooseCheckState,
  type GooseStatus,
  type GooseVerification,
} from "@/lib/goose";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ServiceDiscovery } from "@/components/goose/ServiceDiscovery";
import { AiHandoffExport } from "@/components/goose/AiHandoffExport";
import { NotWiredBadge } from "@/components/common/NotWiredBadge";

export const Route = createFileRoute("/goose")({
  head: () => ({
    meta: [
      { title: "Goose Control — OferTradingBot" },
      {
        name: "description",
        content: "Verify Goose MCP, audit external product instructions, and submit guarded code updates.",
      },
    ],
  }),
  component: GoosePage,
});

const EXAMPLE_SPEC = `# OferTradingBot Hub

## Overview
ממשק React בעברית לשליטה ב-FastAPI קיים. המשתמש יחיד והממשק RTL.

## Architecture & API contract
Frontend בלבד מול REST API בפורט 8050. Goose מחובר דרך MCP.

## Screens
Dashboard, Recommendations, Market Data, Agents, Settings, Theme Studio, Goose, Health.

## Components
KPI cards, RecommendationTable, SentimentChart, AgentRow, GooseStatus, LogViewer.

## State & Real-time
Polling לסטטוס כל 5 שניות, job polling לפעולות ארוכות ומצבי שגיאה.

## מה לא לבנות
לא לבנות לוגיקת מסחר, agent loop, login או DB. ה-frontend הוא שכבת תצוגה ושליטה בלבד.

## Acceptance criteria
כל המסכים responsive, עובדים ב-RTL ומציגים loading, empty ו-error states.

\`\`\`json
{"connected": true, "tools": ["get_status", "scan_market"]}
\`\`\``;

function GoosePage() {
  const [status, setStatus] = useState<GooseStatus>(MOCK_GOOSE_STATUS);
  const [verification, setVerification] = useState<GooseVerification | null>(null);
  const [instructions, setInstructions] = useState(EXAMPLE_SPEC);
  const [changeDescription, setChangeDescription] = useState("");
  const [busy, setBusy] = useState<"status" | "verify" | "submit" | null>(null);
  const [notice, setNotice] = useState("");
  const audit = useMemo(() => auditExternalInstructions(instructions), [instructions]);

  async function loadStatus() {
    setBusy("status");
    try {
      setStatus(await api.gooseStatus());
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    void loadStatus();
  }, []);

  async function verify() {
    setBusy("verify");
    setNotice("");
    try {
      setVerification(await api.gooseVerify());
    } finally {
      setBusy(null);
    }
  }

  async function submitUpdate() {
    if (!changeDescription.trim() || !audit.safeToApply) return;
    setBusy("submit");
    try {
      const result = await api.gooseUpdateCode(changeDescription.trim(), audit);
      setNotice(result.jobId ? `${result.message} Job: ${result.jobId}` : result.message);
    } finally {
      setBusy(null);
    }
  }

  async function copyCompletionPrompt() {
    await navigator.clipboard.writeText(audit.completionPrompt);
    setNotice("הנחיות ההשלמה הועתקו.");
  }

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 md:p-6" dir="rtl">
      <header className="flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-primary/30 bg-primary/10">
            <Bird className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary">MCP Integration</p>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">Goose Control</h1>
              <NotWiredBadge detail="Goose verify / update-code / chat endpoints on the backend are still in progress — running in guarded mock mode." />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">בדיקת חיבור, בקרת הוראות חיצוניות ועדכוני קוד עם guardrails</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={loadStatus} disabled={busy !== null}>
            {busy === "status" ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            רענן סטטוס
          </Button>
          <Button onClick={verify} disabled={busy !== null}>
            {busy === "verify" ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
            בדוק תצורת Goose
          </Button>
        </div>
      </header>

      <ServiceDiscovery />

      <AiHandoffExport />




      <section className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        <div className="rounded-xl border border-border glass p-5">
          <div className="flex items-center justify-between gap-4">
            <SectionTitle icon={Bird} title="מצב החיבור" subtitle={status.endpoint} />
            <StatusPill state={status.connected ? "pass" : "warn"} label={status.connected ? "מחובר" : "מצב fallback"} />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
            <Metric label="MCP Extension" value={status.extensionOk ? "תקין" : "לא זוהה"} />
            <Metric label="Version" value={status.version} />
            <Metric label="Tools" value={`${status.tools.filter((tool) => tool.available).length}/${status.tools.length}`} />
          </div>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {status.tools.map((tool) => (
              <div key={tool.name} className="flex items-start gap-3 rounded-lg border border-border bg-card/40 p-3">
                <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", tool.available ? "bg-success" : "bg-warning")} />
                <div className="min-w-0">
                  <div className="font-mono text-xs text-foreground" dir="ltr">{tool.name}</div>
                  <p className="mt-1 text-xs text-muted-foreground">{tool.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border glass p-5">
          <SectionTitle icon={ClipboardCheck} title="בדיקת תצורה" subtitle="FastAPI · MCP · tools · approvals" />
          <div className="mt-5 space-y-3">
            {(verification?.checks ?? [
              { id: "pending", label: "טרם בוצעה בדיקה", state: "warn" as const, detail: "לחץ על בדוק תצורת Goose" },
            ]).map((check) => (
              <CheckRow key={check.id} state={check.state} label={check.label} detail={check.detail} />
            ))}
          </div>
          {verification && (
            <p className="mt-4 border-t border-border pt-3 font-mono text-[10px] text-muted-foreground">
              נבדק: {new Date(verification.checkedAt).toLocaleString("he-IL")}
            </p>
          )}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="rounded-xl border border-border glass p-5">
          <SectionTitle icon={Sparkles} title="בודק הוראות חיצוניות" subtitle="הדבק PRD או הנחיות מכל ממשק חיצוני" />
          <Textarea
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            className="mt-4 min-h-80 resize-y bg-[var(--terminal-bg)] font-mono text-xs leading-6"
            dir="auto"
            aria-label="הוראות חיצוניות לבדיקה"
          />
          <div className="mt-4 flex items-center gap-3">
            <Progress value={audit.score} className="h-2.5" />
            <span className="w-12 text-left font-mono text-sm text-primary">{audit.score}%</span>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-border glass p-5">
            <div className="flex items-center justify-between gap-3">
              <SectionTitle icon={ShieldCheck} title="דוח התאמה" subtitle={`${audit.recognized.length} תחומים זוהו`} />
              <StatusPill state={audit.safeToApply ? "pass" : "fail"} label={audit.safeToApply ? "בטוח לבדיקה" : "נחסם"} />
            </div>
            <div className="mt-4 space-y-3">
              {audit.findings.map((finding) => (
                <CheckRow key={finding.id} state={finding.state} label={finding.label} detail={finding.detail} />
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border glass p-5">
            <SectionTitle icon={AlertTriangle} title="מה נדרש להשלמה" subtitle={`${audit.missing.length} תחומים חסרים`} />
            {audit.missing.length ? (
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                {audit.missing.map((item) => <li key={item}>• {item}</li>)}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-success">כל תחומי החובה נמצאו במפרט.</p>
            )}
            {audit.conflicts.length > 0 && (
              <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                {audit.conflicts.join(" · ")}
              </div>
            )}
            <Button variant="outline" className="mt-4 w-full" onClick={copyCompletionPrompt}>
              <Copy /> העתק הנחיות השלמה
            </Button>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border glass p-5">
        <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <SectionTitle icon={Code2} title="שליחת שינוי ל-Goose" subtitle="המפרט ודוח הבטיחות מצורפים לבקשה; ביצוע אמיתי תלוי ב-FastAPI" />
            <Textarea
              value={changeDescription}
              onChange={(event) => setChangeDescription(event.target.value)}
              placeholder="לדוגמה: הוסף Theme Studio לפי המפרט, בלי לשנות את לוגיקת המסחר..."
              className="mt-4 min-h-28 bg-card/40"
              dir="auto"
              aria-label="תיאור שינוי קוד עבור Goose"
            />
          </div>
          <Button
            size="lg"
            onClick={submitUpdate}
            disabled={busy !== null || !changeDescription.trim() || !audit.safeToApply}
          >
            {busy === "submit" ? <Loader2 className="animate-spin" /> : <Play />}
            הכן Job לעדכון קוד
          </Button>
        </div>
        {notice && <div className="mt-4 rounded-lg border border-info/30 bg-info/5 p-3 text-sm text-info">{notice}</div>}
      </section>
    </main>
  );
}

function SectionTitle({ icon: Icon, title, subtitle }: { icon: typeof Bird; title: string; subtitle: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Icon className="h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="truncate font-mono text-[10px] text-muted-foreground" dir="auto">{subtitle}</p>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card/40 p-3">
      <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold" dir="auto">{value}</div>
    </div>
  );
}

function StatusPill({ state, label }: { state: GooseCheckState; label: string }) {
  return (
    <span className={cn(
      "shrink-0 rounded-full border px-2.5 py-1 font-mono text-[10px]",
      state === "pass" && "border-success/30 bg-success/10 text-success",
      state === "warn" && "border-warning/30 bg-warning/10 text-warning",
      state === "fail" && "border-destructive/30 bg-destructive/10 text-destructive",
    )}>{label}</span>
  );
}

function CheckRow({ state, label, detail }: { state: GooseCheckState; label: string; detail: string }) {
  const Icon = state === "pass" ? CheckCircle2 : state === "warn" ? AlertTriangle : XCircle;
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card/30 p-3">
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", state === "pass" ? "text-success" : state === "warn" ? "text-warning" : "text-destructive")} />
      <div>
        <div className="text-xs font-semibold">{label}</div>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}