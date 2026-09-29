import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { bridgeStatus, detectChats, forgetToken, startBridge, stopBridge, type BridgeStatus } from "@/lib/telegramBridge";
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

  const [log, setLog] = useState<{ t: string; level: "ok" | "warn" | "err" | "info"; msg: string }[]>([]);
  const add = (level: "ok" | "warn" | "err" | "info", msg: string) => {
    setLog((l) => [{ t: new Date().toLocaleTimeString("he-IL"), level, msg }, ...l].slice(0, 50));
    (level === "err" ? toast.error : level === "ok" ? toast.success : level === "warn" ? toast.warning : toast.info)(msg);
  };
  const explain = (e?: string) => {
    const s = e ?? "";
    if (/fetch|network|abort|Failed to fetch|HTTP 5|404/i.test(s))
      return `השרת המקומי במחשב שלך לא עונה (${s}). הפעל אותו ונסה שוב.`;
    if (/invalid token|Unauthorized|401|Not Found/i.test(s)) return "הטוקן לא תקין. העתק אותו שוב מ-BotFather במלואו.";
    if (/consent/i.test(s)) return 'חסר אישור פרטיות. אשר "טלגרם" ו"שמירת שיחות" במסך "פרטיות ונתונים".';
    if (/no bot token/i.test(s)) return "לא הוזן טוקן ואין טוקן שמור.";
    return s || "שגיאה לא ידועה";
  };
  const tokenTrim = token.trim();
  const tokenValid = /^\d{6,12}:[A-Za-z0-9_-]{30,}$/.test(tokenTrim);
  const chatIds = chats.split(/[,\s]+/).filter(Boolean);
  const chatsValid = chatIds.every((c) => /^-?\d{5,15}$/.test(c));

  const start = async () => {
    if (tokenTrim && !tokenValid) return add("err", "פורמט הטוקן שגוי — צריך להיראות כמו 123456789:AAH...");
    if (!chatsValid) return add("err", "מספר צ'אט חייב להכיל ספרות בלבד (לחץ \"זהה אותי\").");
    if (chatIds.length === 0) add("warn", "לא הוזן מספר צ'אט — כל אחד יוכל לדבר עם הבוט.");
    setBusy(true);
    add("info", "מפעיל את הבוט...");
    const r = await startBridge({ token: tokenTrim || undefined, allowedChatIds: chatIds.map(Number) });
    setBusy(false);
    if (r.ok) { add("ok", `הבוט פעיל: @${r.bot}. שלח לו /status בטלגרם.`); setToken(""); } else add("err", explain(r.error));
    void refresh();
  };

  const detect = async () => {
    if (!tokenTrim && !st?.token_saved) return add("err", "הדבק קודם את הטוקן מ-BotFather.");
    if (tokenTrim && !tokenValid) return add("err", "פורמט הטוקן שגוי — צריך להיראות כמו 123456789:AAH...");
    setBusy(true);
    add("info", "בודק את הטוקן מול טלגרם...");
    const r = await detectChats(tokenTrim || undefined);
    setBusy(false);
    if (!r.ok) return add("err", explain(r.error));
    add("ok", `הטוקן תקין — הבוט הוא @${r.bot}`);
    if (r.note) return add("warn", "הבוט כבר פועל. לחץ \"עצור\" ואז \"זהה אותי\" שוב.");
    if (r.chats.length === 0) return add("warn", `עדיין לא התקבלה הודעה. פתח בטלגרם את @${r.bot}, שלח "שלום" ולחץ שוב "זהה אותי".`);
    setChats(r.chats.map((c) => c.id).join(", "));
    add("ok", `נמצא הצ'אט שלך: ${r.chats.map((c) => (c.username ? "@" + c.username : c.name ?? "") + ` (${c.id})`).join(", ")}`);
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
        <h2 className="font-semibold">הגדרה צעד-אחר-צעד</h2>
        <ol className="list-decimal space-y-2 pr-5 text-sm">
          <li>
            פתח את BotFather ושלח <code>/newbot</code>, בחר שם ושם משתמש שנגמר ב-bot.
            <div className="mt-1 flex flex-wrap gap-2">
              <a href="tg://resolve?domain=BotFather" className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground">פתח באפליקציית טלגרם</a>
              <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="rounded-md border border-border px-3 py-1.5 text-xs">פתח בדפדפן</a>
              <button onClick={() => { void navigator.clipboard.writeText("/newbot"); toast.success("הועתק: /newbot"); }} className="rounded-md border border-border px-3 py-1.5 text-xs">העתק /newbot</button>
            </div>
          </li>
          <li>העתק את הטוקן ש-BotFather שולח (נראה כמו <code>123456:AAH…</code>) והדבק בשדה למטה.</li>
          <li>פתח את הבוט החדש שלך ושלח לו הודעה כלשהי (למשל "שלום").</li>
          <li>לחץ "זהה אותי" — המערכת תמצא את מספר הצ'אט שלך לבד ותמלא אותו.</li>
          <li>אשר טלגרם ושמירת שיחות במסך "פרטיות ונתונים", ולחץ "הפעל".</li>
        </ol>
        <p className="text-xs text-muted-foreground">הטוקן נשמר במסד המקומי שלך, בחלק של נתוני המשתמש — לא בנתוני המערכת.</p>
      </section>

      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <h2 className="font-semibold">חיבור בוט</h2>
        <input type="password" className={field} placeholder="טוקן מ-BotFather (נשמר רק בשרת המקומי)" value={token} onChange={(e) => setToken(e.target.value)} />
        <input className={field} placeholder="מזהי צ'אט מורשים (מופרדים בפסיק) — מומלץ" value={chats} onChange={(e) => setChats(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          <button disabled={busy} onClick={detect} className="rounded-md border border-primary px-3 py-2 text-sm text-primary disabled:opacity-50">זהה אותי</button>
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
