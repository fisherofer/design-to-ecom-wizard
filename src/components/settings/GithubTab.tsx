/** GitHub tab: PAT + repo + connection test. Backend handles push/pull. */
import { useState } from "react";
import { CheckCircle2, Github, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Field } from "./Field";

const STORAGE = "ai-os.settings.github";

interface GithubConfig {
  pat: string;
  repoUrl: string;
  branch: string;
  autoSync: boolean;
}

const DEFAULT: GithubConfig = { pat: "", repoUrl: "", branch: "main", autoSync: false };

export function GithubTab() {
  const [cfg, setCfg] = useState<GithubConfig>(() => {
    if (typeof window === "undefined") return DEFAULT;
    try { return JSON.parse(localStorage.getItem(STORAGE) ?? "null") ?? DEFAULT; } catch { return DEFAULT; }
  });
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  function update<K extends keyof GithubConfig>(key: K, value: GithubConfig[K]) {
    const next = { ...cfg, [key]: value };
    setCfg(next);
    localStorage.setItem(STORAGE, JSON.stringify(next));
  }

  async function testConnection() {
    setTesting(true); setStatus(null);
    try {
      const res = await fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${cfg.pat}`, Accept: "application/vnd.github+json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setStatus({ ok: true, msg: `Authenticated as @${data.login}` });
    } catch (err) {
      setStatus({ ok: false, msg: err instanceof Error ? err.message : "Failed" });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="font-display text-lg font-semibold">GitHub Sync</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Personal Access Token (classic or fine-grained, with <code className="font-mono text-xs">repo</code> scope).
          Stored in browser only. Push/pull operations require your local backend
          to expose <span className="font-mono">/api/github/*</span> endpoints.
        </p>

        <div className="mt-5 grid gap-4">
          <Field label="Personal Access Token (PAT)">
            <input
              type="password"
              placeholder="github_pat_..."
              value={cfg.pat}
              onChange={(e) => update("pat", e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs focus:border-primary focus:outline-none"
            />
          </Field>
          <Field label="Repository URL">
            <input
              type="text"
              placeholder="https://github.com/user/repo"
              value={cfg.repoUrl}
              onChange={(e) => update("repoUrl", e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs focus:border-primary focus:outline-none"
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Branch">
              <input
                type="text"
                value={cfg.branch}
                onChange={(e) => update("branch", e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs focus:border-primary focus:outline-none"
              />
            </Field>
            <Field label="Auto-sync on save">
              <label className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  checked={cfg.autoSync}
                  onChange={(e) => update("autoSync", e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                <span className="text-sm">Push every change automatically</span>
              </label>
            </Field>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={testConnection}
              disabled={!cfg.pat || testing}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Test Connection
            </button>
            {cfg.repoUrl && (
              <a
                href={cfg.repoUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-sm hover:bg-surface-elevated"
              >
                <Github className="h-4 w-4" /> View on GitHub
              </a>
            )}
          </div>

          {status && (
            <div className={cn(
              "flex items-center gap-2 rounded-md border px-3 py-2 text-xs",
              status.ok ? "border-success/40 bg-success/10 text-success" : "border-destructive/40 bg-destructive/10 text-destructive",
            )}>
              {status.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
              <span className="font-mono">{status.msg}</span>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-info/30 bg-info/5 p-4 text-xs text-muted-foreground">
        <div className="font-medium text-info">Backend endpoints expected</div>
        <ul className="mt-2 space-y-1 font-mono">
          <li>POST /api/github/push — commits current source + pushes to {cfg.branch || "main"}</li>
          <li>POST /api/github/pull — pulls latest, returns conflict report</li>
          <li>GET /api/github/status — branch, ahead/behind, last commit</li>
        </ul>
      </section>
    </div>
  );
}
