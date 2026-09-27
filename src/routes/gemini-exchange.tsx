import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { geminiExchangeReply, geminiExchangeScan, type ExchangeFile } from "@/lib/driveSync.functions";
import { aiComplete } from "@/lib/aiRouter";
import { getSqlScopes } from "@/lib/portableStorage";

export const Route = createFileRoute("/gemini-exchange")({
  head: () => ({
    meta: [
      { title: "Gemini Exchange — Import / Response" },
      { name: "description", content: "Local AI reviews files from Gemini AI Studio Active sync and writes full responses back to Drive." },
      { property: "og:title", content: "Gemini Exchange — Import / Response" },
      { property: "og:description", content: "Two-way file exchange between Gemini AI Studio and the local AI." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GeminiExchange,
});

const SYSTEM = `You are the local AI of a closed, portable trading OS. You review a file sent from Gemini AI Studio.
Answer in Hebrew, in Markdown, with these sections exactly:
## מה נבדק
## מה נדרש
## מה לא נדרש / נדחה (ולמה)
## מה לא תקין
## מה בוצע / מה יבוצע (כהצעה הממתינה לאישור הבעלים)
## שאלות חוזרות ל-Gemini
Rules: never invent data; code changes are proposals only; no secrets.`;

function GeminiExchange() {
  const scan = useServerFn(geminiExchangeScan);
  const reply = useServerFn(geminiExchangeReply);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<Awaited<ReturnType<typeof geminiExchangeScan>> | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [scopes, setScopes] = useState<string>("…");

  const load = async () => {
    setBusy(true);
    try {
      setData(await scan({ data: {} }));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void load();
    void getSqlScopes().then((r) =>
      setScopes(r.ok ? Object.entries(r.scopes).map(([s, v]) => `${s}: ${v.keys}`).join(" · ") : `לא זמין (${r.error})`),
    );
    const t = setInterval(() => void load(), 120_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const analyze = async (f: ExchangeFile) => {
    if (!f.text) return toast.error("לא ניתן לקרוא את הקובץ כטקסט");
    setBusy(true);
    try {
      const live = data?.liveFiles.map((x) => x.name).join(", ") ?? "";
      const res = await aiComplete({
        system: SYSTEM,
        prompt: `Files in Active sync live: ${live}\n\n--- ${f.name} ---\n${f.text}`,
        task: "reasoning",
        sensitivity: "private",
        maxTokens: 1800,
        temperature: 0.2,
      });
      if (!res.ok) return toast.error(`ה-AI המקומי לא זמין: ${res.error ?? res.trace.join(" → ")}`);
      const body = `# תשובה ל-${f.name}\n\n_נוצר: ${new Date().toISOString()} · מנוע: ${res.engine}/${res.model}_\n\n${res.text}\n`;
      setAnswers((a) => ({ ...a, [f.id]: body }));
    } finally {
      setBusy(false);
    }
  };

  const send = async (f: ExchangeFile) => {
    const body = answers[f.id];
    if (!body) return;
    const r = await reply({ data: { name: `response-${f.name.replace(/\.[^.]+$/, "")}.md`, body } });
    r.ok ? toast.success(`נשלח לתיקיית Response: ${r.name}`) : toast.error(r.error ?? "שגיאה");
  };

  return (
    <div dir="rtl" className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Gemini Exchange</h1>
          <p className="text-sm text-muted-foreground">{data?.path ?? "My Drive / AI / Gemini aistudio / Active sync live"}</p>
        </div>
        <Button onClick={() => void load()} disabled={busy}>רענן</Button>
      </div>

      <Card className="p-4 text-sm">
        <span className="font-medium">מסד SQL מקומי: </span>
        <span className="font-mono text-xs text-muted-foreground">{scopes}</span>
      </Card>

      {data?.error && <Card className="border-destructive p-4 text-sm text-destructive">{data.error}</Card>}

      <Card className="p-4">
        <h2 className="mb-2 font-medium">קבצים ב-Active sync live ({data?.liveFiles.length ?? 0})</h2>
        <div className="flex flex-wrap gap-1">
          {data?.liveFiles.map((f) => <Badge key={f.name} variant="secondary">{f.name}</Badge>)}
        </div>
      </Card>

      <h2 className="font-medium">Import ({data?.imports.length ?? 0})</h2>
      {data?.imports.map((f) => (
        <Card key={f.id} className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-mono text-sm">{f.name}</div>
              <div className="text-xs text-muted-foreground">{f.modifiedTime}</div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => void analyze(f)} disabled={busy || !f.text}>נתח עם Local AI</Button>
              <Button size="sm" variant="outline" onClick={() => void send(f)} disabled={!answers[f.id]}>שלח ל-Response</Button>
            </div>
          </div>
          <pre className="max-h-40 overflow-auto rounded bg-muted p-2 text-xs" dir="ltr">{f.text?.slice(0, 2000) ?? "(קובץ בינארי / לא ניתן לקריאה)"}</pre>
          {answers[f.id] && (
            <textarea
              className="h-64 w-full rounded border border-border bg-background p-2 text-sm"
              value={answers[f.id]}
              onChange={(e) => setAnswers((a) => ({ ...a, [f.id]: e.target.value }))}
            />
          )}
        </Card>
      ))}
    </div>
  );
}
