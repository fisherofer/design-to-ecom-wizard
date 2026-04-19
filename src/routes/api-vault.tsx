import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { KeyRound, Plus, X, Eye, EyeOff } from "lucide-react";

export const Route = createFileRoute("/api-vault")({
  head: () => ({
    meta: [
      { title: "API Vault — AI Executive OS" },
      { name: "description", content: "Encrypted API key management for LLM, data, and broker providers." },
    ],
  }),
  component: ApiVault,
});

const KEYS = [
  { provider: "Gemini", type: "LLM", key: "AIzaSyB8x...K2pQ", tier: "Pro", status: "ok" },
  { provider: "Groq", type: "LLM", key: "gsk_4f9a...Mn3X", tier: "Free", status: "ok" },
  { provider: "Perplexity", type: "LLM", key: "pplx-7c2a...Vk9R", tier: "Pro", status: "warn" },
  { provider: "OpenAI", type: "LLM", key: "sk-proj-aBc1...xY2Z", tier: "Pro", status: "ok" },
  { provider: "Polygon", type: "Data", key: "Lqh8K_...ftR4", tier: "Free", status: "ok" },
  { provider: "Alpaca", type: "Broker", key: "PKE7XV...92AB", tier: "Live", status: "ok" },
  { provider: "Binance", type: "Broker", key: "MhT5q...C8Wn", tier: "Live", status: "warn" },
  { provider: "Anthropic", type: "LLM", key: "sk-ant-...j3kP", tier: "Pro", status: "err" },
];

function ApiVault() {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);

  return (
    <div className="px-6 py-6">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
            <KeyRound className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">API Vault</h1>
            <p className="text-sm text-muted-foreground font-mono">
              Encrypted credential store · {KEYS.length} keys managed
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAll((s) => !s)}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-card/50 px-3 py-2 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
          >
            {showAll ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {showAll ? "Mask" : "Reveal"}
          </button>
          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[0_0_24px_-6px_var(--primary)] hover:opacity-90 transition-opacity"
          >
            <Plus className="h-4 w-4" />
            Add API Key
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border glass overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-card/50 text-left text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              <th className="px-5 py-3">Provider</th>
              <th className="px-3 py-3">Type</th>
              <th className="px-3 py-3">Key</th>
              <th className="px-3 py-3">Tier</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {KEYS.map((k) => (
              <tr key={k.provider} className="hover:bg-card/40 transition-colors">
                <td className="px-5 py-3.5">
                  <div className="font-medium">{k.provider}</div>
                </td>
                <td className="px-3 py-3.5">
                  <TypeTag type={k.type} />
                </td>
                <td className="px-3 py-3.5 font-mono text-xs text-muted-foreground tabular-nums">
                  {showAll ? k.key.replace("...", "ABCDEFGHIJKL") : k.key}
                </td>
                <td className="px-3 py-3.5">
                  <span className="rounded border border-border bg-muted/50 px-2 py-0.5 font-mono text-[10px] uppercase">
                    {k.tier}
                  </span>
                </td>
                <td className="px-3 py-3.5">
                  <StatusDot status={k.status} />
                </td>
                <td className="px-5 py-3.5 text-right">
                  <button className="text-xs font-mono text-muted-foreground hover:text-foreground transition-colors">
                    edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && <AddKeyModal onClose={() => setOpen(false)} />}
    </div>
  );
}

function TypeTag({ type }: { type: string }) {
  const map: Record<string, string> = {
    LLM: "bg-primary/15 text-primary border-primary/30",
    Data: "bg-warning/15 text-warning border-warning/30",
    Broker: "bg-accent/15 text-accent border-accent/30",
  };
  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${map[type]}`}>
      {type}
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string }> = {
    ok: { color: "bg-success", label: "Active" },
    warn: { color: "bg-warning", label: "Quota Low" },
    err: { color: "bg-destructive", label: "Expired" },
  };
  const s = map[status];
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-xs">
      <span className={`h-2 w-2 rounded-full ${s.color} ${status === "ok" ? "pulse-dot shadow-[0_0_8px_currentColor]" : ""}`} />
      <span className="text-muted-foreground">{s.label}</span>
    </span>
  );
}

function AddKeyModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border-strong glass-strong p-6 shadow-[0_20px_60px_-20px_var(--primary)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Add API Key</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-5 space-y-4">
          <Field label="Provider" placeholder="e.g. Gemini, Groq, Polygon" />
          <Field label="Type" placeholder="LLM · Data · Broker" />
          <Field label="API Key" placeholder="paste key…" mono />
          <Field label="Tier" placeholder="Free · Pro · Live" />
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-border bg-card/50 px-4 py-2 text-sm hover:border-border-strong transition-colors"
          >
            Cancel
          </button>
          <button className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[0_0_24px_-6px_var(--primary)] hover:opacity-90 transition-opacity">
            Encrypt &amp; Store
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, placeholder, mono }: { label: string; placeholder: string; mono?: boolean }) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        {label}
      </label>
      <input
        placeholder={placeholder}
        className={`h-10 w-full rounded-md border border-border bg-card/50 px-3 text-sm placeholder:text-muted-foreground/50 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-colors ${mono ? "font-mono" : ""}`}
      />
    </div>
  );
}
