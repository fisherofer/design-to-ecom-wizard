import { useEffect, useRef, useState } from "react";
import { MessageSquare, X, Send, Bot, User as UserIcon, Sparkles, Eye, EyeOff, Trash2, Crosshair } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { api, type ChatMessage, type EngineId } from "@/lib/api";
import { cn } from "@/lib/utils";

const ENGINES: { id: EngineId; label: string }[] = [
  { id: "gemini", label: "Gemini 1.5 Pro" },
  { id: "ollama", label: "Ollama 8B (local)" },
  { id: "claude", label: "Claude 3.5" },
  { id: "groq", label: "Groq Llama-70B" },
];

export function FloatingChat() {
  const { chatOpen, setChatOpen, chatTransparent, setChatTransparent, activeEngine, setActiveEngine } = useApp();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "sys-1",
      role: "assistant",
      engine: activeEngine,
      ts: Date.now(),
      content:
        "Connected. I can route to **Gemini**, **Claude**, or your local **Ollama 8B**. Ask me to fix code, restart Docker, audit configs, or summarize logs.",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [focused, setFocused] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const chatRootRef = useRef<HTMLDivElement>(null);
  const lastHoveredRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, chatOpen]);

  // -------- Inspector Mode (element picker) --------
  useEffect(() => {
    if (!inspecting) return;

    const OUTLINE = "2px solid hsl(var(--primary, 190 95% 55%))";
    const SHADOW = "0 0 0 4px color-mix(in oklab, var(--primary) 25%, transparent)";

    const isInsideChat = (el: HTMLElement | null) =>
      !!el && !!chatRootRef.current && chatRootRef.current.contains(el);

    const clearLast = () => {
      if (lastHoveredRef.current) {
        lastHoveredRef.current.style.outline = "";
        lastHoveredRef.current.style.outlineOffset = "";
        lastHoveredRef.current.style.boxShadow = "";
        lastHoveredRef.current = null;
      }
    };

    const onMove = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || isInsideChat(target)) {
        clearLast();
        return;
      }
      if (lastHoveredRef.current === target) return;
      clearLast();
      target.style.outline = OUTLINE;
      target.style.outlineOffset = "2px";
      target.style.boxShadow = SHADOW;
      lastHoveredRef.current = target;
    };

    const describe = (el: HTMLElement) => {
      const tag = el.tagName.toLowerCase();
      const id = el.id ? `#${el.id}` : "";
      const cls = typeof el.className === "string" && el.className
        ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".")
        : "";
      const text = (el.innerText || "").trim().replace(/\s+/g, " ").slice(0, 80);
      return `<${tag}${id}${cls}>${text ? ` "${text}"` : ""}`;
    };

    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || isInsideChat(target)) return;
      e.preventDefault();
      e.stopPropagation();
      const ctx = describe(target);
      setInput(`I want to edit this element: ${ctx}`);
      clearLast();
      setInspecting(false);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        clearLast();
        setInspecting(false);
      }
    };

    document.body.style.cursor = "crosshair";
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);

    return () => {
      document.body.style.cursor = "";
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey, true);
      clearLast();
    };
  }, [inspecting]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    const user: ChatMessage = { id: `u_${Date.now()}`, role: "user", content: text, ts: Date.now() };
    const next = [...messages, user];
    setMessages(next);
    setInput("");
    setSending(true);
    try {
      const { reply, engine } = await api.chat(next, activeEngine);
      setMessages((m) => [
        ...m,
        { id: `a_${Date.now()}`, role: "assistant", content: reply, engine, ts: Date.now() },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        {
          id: `a_${Date.now()}`,
          role: "assistant",
          content: "⚠ Backend unreachable at `localhost:8000`. Start `api_bridge.py` to enable live routing.",
          ts: Date.now(),
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  // -------- Floating launcher --------
  if (!chatOpen) {
    return (
      <button
        onClick={() => setChatOpen(true)}
        aria-label="Open AI assistant"
        className="fixed bottom-10 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full border border-primary/40 bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-[0_0_30px_-2px_var(--primary)] transition-transform hover:scale-105"
      >
        <MessageSquare className="h-6 w-6" />
        <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-success ring-2 ring-background pulse-dot" />
      </button>
    );
  }

  // -------- Chat panel --------
  return (
    <div
      className={cn(
        "fixed bottom-10 right-6 z-40 flex w-[min(420px,calc(100vw-3rem))] flex-col rounded-2xl border shadow-[0_24px_80px_-24px_var(--primary)] transition-all",
        chatTransparent
          ? "h-[min(560px,70vh)] border-primary/20 bg-background/20 backdrop-blur-sm"
          : "h-[min(620px,80vh)] border-primary/30 bg-background/85 backdrop-blur-xl",
      )}
      style={{
        boxShadow: chatTransparent
          ? "0 0 1px var(--primary), 0 20px 60px -30px rgba(0,0,0,0.4)"
          : undefined,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-primary/20 px-4 py-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/20 text-primary">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-mono">
              <span className="h-1.5 w-1.5 rounded-full bg-success pulse-dot shrink-0" />
              <select
                value={activeEngine}
                onChange={(e) => setActiveEngine(e.target.value as EngineId)}
                className="bg-transparent text-foreground font-semibold outline-none cursor-pointer hover:text-primary transition-colors"
              >
                {ENGINES.map((e) => (
                  <option key={e.id} value={e.id} className="bg-background">
                    {e.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              connected · {chatTransparent ? "ghost mode" : "focus mode"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setChatTransparent(!chatTransparent)}
            title={chatTransparent ? "Solid mode" : "Transparent mode"}
            className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-card/60 hover:text-foreground transition-colors"
          >
            {chatTransparent ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={() => setMessages([])}
            title="Clear conversation"
            className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-card/60 hover:text-destructive transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setChatOpen(false)}
            title="Close"
            className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-card/60 hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map((m) => (
          <Bubble key={m.id} msg={m} transparent={chatTransparent} />
        ))}
        {sending && (
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
            <Bot className="h-3.5 w-3.5 text-primary" />
            <span className="flex gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-primary pulse-dot" />
              <span className="h-1.5 w-1.5 rounded-full bg-primary pulse-dot" style={{ animationDelay: "0.15s" }} />
              <span className="h-1.5 w-1.5 rounded-full bg-primary pulse-dot" style={{ animationDelay: "0.3s" }} />
            </span>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-primary/20 p-3">
        <div
          className={cn(
            "flex items-end gap-2 rounded-xl border bg-card/60 px-3 py-2 transition-all",
            focused ? "border-primary/60 shadow-[0_0_20px_-4px_var(--primary)]" : "border-border",
          )}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Ask anything · ⏎ to send"
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm placeholder:text-muted-foreground/60 outline-none max-h-32"
          />
          <button
            onClick={send}
            disabled={!input.trim() || sending}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-[0_0_18px_-4px_var(--primary)] disabled:opacity-40 disabled:shadow-none transition-all hover:scale-105"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="mt-1.5 flex items-center justify-between px-1 text-[10px] font-mono text-muted-foreground/60">
          <span>local · {activeEngine}</span>
          <span>shift+⏎ for new line</span>
        </div>
      </div>
    </div>
  );
}

function Bubble({ msg, transparent }: { msg: ChatMessage; transparent: boolean }) {
  const isUser = msg.role === "user";
  return (
    <div className={cn("flex gap-2", isUser ? "flex-row-reverse" : "flex-row")}>
      <div
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-md mt-0.5",
          isUser ? "bg-secondary text-foreground" : "bg-primary/15 text-primary",
        )}
      >
        {isUser ? <UserIcon className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
      </div>
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
          isUser
            ? "bg-secondary text-foreground rounded-tr-sm"
            : transparent
            ? "bg-primary/5 border border-primary/20 text-foreground rounded-tl-sm backdrop-blur-sm"
            : "bg-primary/10 border border-primary/25 text-foreground rounded-tl-sm",
        )}
      >
        <FormattedContent text={msg.content} />
        {!isUser && msg.engine && (
          <div className="mt-1 text-[9px] font-mono uppercase tracking-widest text-muted-foreground/70">
            via {msg.engine}
          </div>
        )}
      </div>
    </div>
  );
}

function FormattedContent({ text }: { text: string }) {
  // Lightweight renderer: ```code``` blocks, **bold**, `inline`
  const blocks: { type: "code" | "text"; content: string }[] = [];
  const parts = text.split(/```/);
  parts.forEach((p, i) => blocks.push({ type: i % 2 === 1 ? "code" : "text", content: p }));

  return (
    <div className="space-y-2">
      {blocks.map((b, i) =>
        b.type === "code" ? (
          <pre
            key={i}
            className="overflow-x-auto rounded-md border border-border bg-[var(--terminal-bg)] p-2.5 font-mono text-[11px] text-success"
          >
            <code>{b.content.replace(/^[a-z]+\n/, "")}</code>
          </pre>
        ) : (
          <p key={i} className="whitespace-pre-wrap">
            {renderInline(b.content)}
          </p>
        ),
      )}
    </div>
  );
}

function renderInline(text: string) {
  const nodes: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let match;
  let i = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const m = match[0];
    if (m.startsWith("**")) {
      nodes.push(<strong key={i++} className="text-primary font-semibold">{m.slice(2, -2)}</strong>);
    } else {
      nodes.push(
        <code key={i++} className="rounded bg-card/80 border border-border px-1 py-0.5 font-mono text-[11px] text-primary">
          {m.slice(1, -1)}
        </code>,
      );
    }
    last = match.index + m.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}
