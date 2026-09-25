import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { bridgeStatus, forgetToken, startBridge, stopBridge, type BridgeStatus } from "@/lib/telegramBridge";
import { listTasks, type FleetTask } from "@/lib/fleet";

export const Route = createFileRoute("/telegram")({
  head: () => ({
    meta: [
      { title: "Telegram Bridge — Talk to Your Local Agents" },
      { name: "description", content: "Enter a bot token, start the local Telegram bridge and see every message in the agent task queue." },
      { property: "og:title", content: "Telegram Bridge" },
      { property: "og:description", content: "Local Telegram bridge with every message logged to the task queue." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TelegramPage,
});

function TelegramPage() {
  const [st, setSt] = useState<BridgeStatus | null>(null);
  const [tasks, setTasks] = useState<FleetTask[]>([]);
  const [taskErr, setTaskErr] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [chats, setChats] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setSt(await bridgeStatus());
    try {
      const r = await listTasks(undefined, 200);
      setTasks(r.tasks.filter((t) => String((t.spec as { source?: string })?.source ?? "").startsWith("telegram:")));
      setTaskErr(null);
    } catch (e) {
      setTaskErr((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const i = setInterval(refresh, 10_000);
    return () => clearInterval(i);
  }, [refresh]);

  const start = async () => {
    setBusy(true);
    const ids = chats.split(/[,\s]+/).map(Number).filter((n) => Number.isFinite(n) && n !== 0);
    const r = await startBridge({ token: token.trim() || undefined, allowedChatIds: ids });
    setBusy(false);
    if (r.ok) { toast.success(`הבוט פעיל: @${r.bot}`); setToken(""); } else toast.error(r.error ?? "נכשל");
    void refresh();
  };

  const field = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
  return (
    <div dir="rtl" className="space-y-6 p-6">
      <h1 className="font-display text-2xl font-semibold">גשר טלגרם</h1>
      {st?.unavailable && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          השרת המקומי לא זמין ({st.unavailable}). הפעל את השרת במחשב שלך כדי לחבר את הבוט.
        </div>
      )}
      <section className="grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-4">
        <Stat label="מצב" value={st?.running ? "פעיל" : "כבוי"} />
        <Stat label="התקבלו" value={String(st?.messages_in ?? 0)} />
        <Stat label="נשלחו" value={String(st?.messages_out ?? 0)} />
        <Stat label="טוקן שמור" value={st?.token_saved ? "כן" : "לא"} />
        {st?.last_error && <p className="text-sm text-destructive md:col-span-4">שגיאה אחרונה: {st.last_error}</p>}
        {st && (!st.consent_telegram || !st.consent_history) && !st.unavailable && (
          <p className="text-sm text-warning md:col-span-4">נדרש אישור פרטיות לטלגרם ולשמירת שיחות במסך "פרטיות ונתונים".</p>
        )}
      </section>

      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <h2 className="font-semibold">חיבור בוט</h2>
        <input type="password" className={field} placeholder="טוקן מ-BotFather (נשמר רק בשרת המקומי)" value={token} onChange={(e) => setToken(e.target.value)} />
        <input className={field} placeholder="מזהי צ'אט מורשים (מופרדים בפסיק) — מומלץ" value={chats} onChange={(e) => setChats(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          <button disabled={busy} onClick={start} className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50">הפעל</button>
          <button onClick={async () => { await stopBridge(); void refresh(); }} className="rounded-md border border-border px-3 py-2 text-sm">עצור</button>
          <button onClick={async () => { await forgetToken(); void refresh(); }} className="rounded-md border border-border px-3 py-2 text-sm">מחק טוקן</button>
        </div>
        <p className="text-xs text-muted-foreground">פקודות: /status, /agents, /tasks, /task &lt;תיאור&gt;, /proposals, /memory. כל הודעה נכנסת לתור המשימות.</p>
      </section>

      <section className="space-y-2 rounded-lg border border-border bg-card p-4">
        <h2 className="font-semibold">הודעות טלגרם בתור המשימות</h2>
        {taskErr && <p className="text-sm text-destructive">תור המשימות לא זמין: {taskErr}</p>}
        {!taskErr && tasks.length === 0 && <p className="text-sm text-muted-foreground">אין עדיין הודעות.</p>}
        <ul className="divide-y divide-border text-sm">
          {tasks.map((t) => (
            <li key={t.id} className="flex justify-between gap-3 py-2">
              <span>#{t.id} {t.title}</span>
              <span className="font-mono text-xs text-muted-foreground">{t.status} · {new Date(t.created_at * 1000).toLocaleString("he-IL")}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-mono text-lg">{value}</div>
    </div>
  );
}
