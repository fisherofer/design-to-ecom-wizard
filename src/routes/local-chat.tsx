import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Bot, Cloud, Cpu, Loader2, Send, Trash2, MessageSquare, Radio } from "lucide-react";
import { toast } from "sonner";
import { aiComplete, type Engine } from "@/lib/aiRouter";
import {
  deleteConversation,
  getMessages,
  listConversations,
  storeAvailable,
  type StoredConversation,
  type StoredMessage,
} from "@/lib/localStore";
import { bridgeStatus, forgetToken, startBridge, stopBridge, type BridgeStatus } from "@/lib/telegramBridge";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/local-chat")({
  head: () => ({
    meta: [
      { title: "Local AI Chat — On-Device Assistant & Telegram Bridge" },
      {
        name: "description",
        content:
          "Talk to the on-device model, keep every conversation in the local venv database, and reach the same assistant from Telegram.",
      },
      { property: "og:title", content: "Local AI Chat — On-Device Assistant" },
      {
        property: "og:description",
        content: "Private chat with your local model, stored locally and reachable from Telegram.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LocalChatPage,
});

function newConversationId() {
  return `app:${Date.now().toString(36)}`;
}

function LocalChatPage() {
  const [engine, setEngine] = useState<Engine>("local");
  const [convId, setConvId] = useState(newConversationId);
  const [conversations, setConversations] = useState<StoredConversation[]>([]);
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [dbUp, setDbUp] = useState<boolean | null>(null);
  const [tg, setTg] = useState<BridgeStatus | null>(null);
  const [token, setToken] = useState("");
  const [allowed, setAllowed] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  async function refreshHistory() {
    setConversations(await listConversations("user", 30));
  }

  useEffect(() => {
    void (async () => {
      const up = await storeAvailable();
      setDbUp(up);
      if (up) await refreshHistory();
      setTg(await bridgeStatus());
    })();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, busy]);

  async function openConversation(id: string) {
    setConvId(id);
    setMessages(await getMessages(id));
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);
    const optimistic: StoredMessage = {
      id: Date.now(), conversation_id: convId, scope: "user", role: "user", content: text,
      model: null, runtime: null, latency_ms: null, created_at: Date.now() / 1000,
    };
    setMessages((m) => [...m, optimistic]);

    const res = await aiComplete({
      prompt: text,
      task: "chat",
      // Personal chat stays on the machine unless the user picks the cloud.
      sensitivity: engine === "local" ? "private" : "public",
      force: engine,
      conversationId: convId,
      scope: "user",
      channel: "app",
      maxTokens: 900,
    });
    setBusy(false);

    if (!res.ok) {
      toast.error(res.error ?? "No engine answered");
      setMessages((m) => [
        ...m,
        { ...optimistic, id: Date.now() + 1, role: "assistant", content: `⚠️ ${res.error ?? "unavailable"}` },
      ]);
      return;
    }
    setMessages((m) => [
      ...m,
      {
        ...optimistic, id: Date.now() + 1, role: "assistant", content: res.text,
        model: res.model, runtime: res.runtime, latency_ms: res.latencyMs,
      },
    ]);
    if (dbUp) await refreshHistory();
  }

  async function removeConversation(id: string) {
    await deleteConversation(id);
    if (id === convId) {
      setConvId(newConversationId());
      setMessages([]);
    }
    await refreshHistory();
  }

  async function toggleBridge() {
    if (tg?.running) {
      const res = await stopBridge();
      toast[res.ok ? "success" : "error"](res.ok ? "Telegram bridge stopping" : res.error!);
    } else {
      const ids = allowed
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n !== 0);
      const res = await startBridge({ token: token.trim() || undefined, allowedChatIds: ids });
      toast[res.ok ? "success" : "error"](res.ok ? `Bridge live as @${res.bot}` : res.error!);
      if (res.ok) setToken("");
    }
    setTg(await bridgeStatus());
  }

  return (
    <div className="grid gap-4 p-4 lg:grid-cols-[280px_1fr]">
      <aside className="space-y-4">
        <section className="rounded-xl border border-border glass p-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <MessageSquare className="h-4 w-4 text-primary" /> היסטוריית שיחות
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {dbUp === null
              ? "בודק את המסד המקומי…"
              : dbUp
                ? "נשמר במסד ה-SQL המקומי בתוך ה-VENV."
                : "המסד המקומי אינו זמין — השיחה לא תישמר."}
          </p>
          <button
            onClick={() => {
              setConvId(newConversationId());
              setMessages([]);
            }}
            className="mt-2 w-full rounded-md border border-border px-2 py-1.5 text-xs hover:bg-accent"
          >
            שיחה חדשה
          </button>
          <ul className="mt-2 space-y-1">
            {conversations.map((c) => (
              <li key={c.id} className="flex items-center gap-1">
                <button
                  onClick={() => void openConversation(c.id)}
                  className={cn(
                    "flex-1 truncate rounded-md px-2 py-1 text-left text-xs hover:bg-accent",
                    c.id === convId && "bg-accent",
                  )}
                  title={c.title ?? c.id}
                >
                  {c.channel === "telegram" ? "📱 " : "💬 "}
                  {c.title ?? c.id} ({c.message_count})
                </button>
                <button
                  onClick={() => void removeConversation(c.id)}
                  aria-label="מחיקת שיחה"
                  className="rounded-md p-1 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
            {dbUp && !conversations.length && (
              <li className="px-2 py-1 text-xs text-muted-foreground">אין שיחות שמורות עדיין.</li>
            )}
          </ul>
        </section>

        <section className="rounded-xl border border-border glass p-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Radio className="h-4 w-4 text-primary" /> גשר טלגרם
          </h2>
          {tg?.unavailable ? (
            <p className="mt-1 text-xs text-muted-foreground">
              השרת המקומי אינו זמין ({tg.unavailable}) — הפעל את ה-hub במחשב.
            </p>
          ) : (
            <>
              <p className="mt-1 text-xs text-muted-foreground">
                {tg?.running
                  ? `פעיל · נכנסו ${tg.messages_in} · יצאו ${tg.messages_out}`
                  : "כבוי. הגשר רץ במחשב שלך ומדבר עם המודל המקומי בלבד."}
              </p>
              {tg && !tg.consent_telegram && (
                <p className="mt-1 text-xs text-amber-500">
                  נדרש אישור פרטיות ל-telegram_bridge במסך הפרטיות.
                </p>
              )}
              {!tg?.running && (
                <>
                  <input
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder={tg?.token_saved ? "טוקן שמור — השאר ריק" : "Bot token מ-BotFather"}
                    type="password"
                    className="mt-2 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                  />
                  <input
                    value={allowed}
                    onChange={(e) => setAllowed(e.target.value)}
                    placeholder="chat id מורשה (מופרד בפסיק)"
                    className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                  />
                </>
              )}
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => void toggleBridge()}
                  className="flex-1 rounded-md border border-border px-2 py-1.5 text-xs hover:bg-accent"
                >
                  {tg?.running ? "עצור גשר" : "הפעל גשר"}
                </button>
                {tg?.token_saved && !tg.running && (
                  <button
                    onClick={async () => {
                      await forgetToken();
                      setTg(await bridgeStatus());
                    }}
                    className="rounded-md border border-border px-2 py-1.5 text-xs hover:bg-accent"
                  >
                    מחק טוקן
                  </button>
                )}
              </div>
              {tg?.last_error && <p className="mt-1 text-xs text-destructive">{tg.last_error}</p>}
            </>
          )}
        </section>
      </aside>

      <main className="flex min-h-[70vh] flex-col rounded-xl border border-border glass">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h1 className="flex items-center gap-2 text-lg font-semibold">
              <Bot className="h-5 w-5 text-primary" /> שיחה עם ה-AI המקומי
            </h1>
            <p className="text-xs text-muted-foreground">
              במצב מקומי הטקסט לא יוצא מהמחשב — גם לא לענן.
            </p>
          </div>
          <div className="flex gap-1 rounded-lg border border-border p-1">
            {(["local", "cloud"] as Engine[]).map((e) => (
              <button
                key={e}
                onClick={() => setEngine(e)}
                className={cn(
                  "flex items-center gap-1 rounded-md px-2 py-1 text-xs",
                  engine === e ? "bg-primary text-primary-foreground" : "hover:bg-accent",
                )}
              >
                {e === "local" ? <Cpu className="h-3.5 w-3.5" /> : <Cloud className="h-3.5 w-3.5" />}
                {e === "local" ? "מקומי" : "ענן"}
              </button>
            ))}
          </div>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {!messages.length && (
            <p className="text-sm text-muted-foreground">
              שאל כל דבר. השיחה תישמר במסד המקומי ותהיה זמינה גם מטלגרם.
            </p>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                "max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap",
                m.role === "user" ? "ml-auto bg-primary/10" : "bg-muted",
              )}
            >
              {m.content}
              {m.role === "assistant" && m.model && (
                <span className="mt-1 block text-[10px] text-muted-foreground">
                  {m.runtime} · {m.model}
                  {m.latency_ms ? ` · ${m.latency_ms}ms` : ""}
                </span>
              )}
            </div>
          ))}
          {busy && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> המודל חושב…
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="flex gap-2 border-t border-border p-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="כתוב הודעה…"
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <button
            onClick={() => void send()}
            disabled={busy || !input.trim()}
            className="flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
          >
            <Send className="h-4 w-4" /> שלח
          </button>
        </div>
      </main>
    </div>
  );
}
