/**
 * SecretVaultPanel — operator controls for the encrypted secret vault.
 * Create (and migrate plaintext stores into) the vault, unlock, lock,
 * change passphrase, or remove encryption entirely.
 */
import { useState } from "react";
import { KeyRound, Lock, LockOpen, ShieldCheck, AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { secureVault, useVaultStatus } from "@/lib/secureVault";
import { PROVIDER_KEY_STORE } from "@/lib/apiKeyVault";
import { CREDENTIALS_STORE } from "@/lib/apiCredentials";

const MIGRATE = [PROVIDER_KEY_STORE, CREDENTIALS_STORE];

export function SecretVaultPanel() {
  const status = useVaultStatus();
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const info = secureVault.info();

  async function act(fn: () => Promise<{ ok: boolean; detail: string }>) {
    setBusy(true);
    try {
      const r = await fn();
      setMsg({ ok: r.ok, text: r.detail });
      if (r.ok) {
        setPass("");
        setPass2("");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <header className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Encrypted secret vault</h2>
        </div>
        <Badge
          variant="outline"
          className={
            status === "unlocked"
              ? "border-warning/40 bg-warning/10 text-warning"
              : status === "locked"
                ? "border-success/40 bg-success/10 text-success"
                : "border-destructive/40 bg-destructive/10 text-destructive"
          }
        >
          {status === "off" ? "Not encrypted" : status === "locked" ? "Locked" : "Unlocked"}
        </Badge>
      </header>

      <p className="mb-3 text-xs text-muted-foreground">
        API keys and provider credentials held in this browser are encrypted with AES-GCM using a key derived from your
        passphrase (PBKDF2, 250,000 iterations). While locked, nothing can read them — not this app, not a script, not an
        extension reading local storage.
      </p>

      {status === "off" && (
        <div className="space-y-2">
          <Input
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            placeholder="Choose a passphrase (min. 8 characters)"
            className="font-mono text-xs"
          />
          <Input
            type="password"
            value={pass2}
            onChange={(e) => setPass2(e.target.value)}
            placeholder="Repeat passphrase"
            className="font-mono text-xs"
          />
          <Button
            size="sm"
            disabled={busy || pass.length < 8 || pass !== pass2}
            onClick={() => act(() => secureVault.enable(pass, MIGRATE))}
          >
            <ShieldCheck className="mr-1.5 h-3.5 w-3.5" /> Encrypt existing secrets
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Existing keys are moved into the vault and erased from plain storage. There is no recovery — lose the
            passphrase and the keys must be re-entered.
          </p>
        </div>
      )}

      {status === "locked" && (
        <div className="space-y-2">
          <Input
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            placeholder="Passphrase"
            className="font-mono text-xs"
            onKeyDown={(e) => e.key === "Enter" && pass && act(() => secureVault.unlock(pass))}
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy || !pass} onClick={() => act(() => secureVault.unlock(pass))}>
              <LockOpen className="mr-1.5 h-3.5 w-3.5" /> Unlock
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || !pass}
              onClick={() => act(() => secureVault.disable(pass))}
            >
              Remove encryption
            </Button>
          </div>
        </div>
      )}

      {status === "unlocked" && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => {
                secureVault.lock();
                setMsg({ ok: true, text: "Vault locked." });
              }}
            >
              <Lock className="mr-1.5 h-3.5 w-3.5" /> Lock now
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              placeholder="Current passphrase"
              className="font-mono text-xs"
            />
            <Input
              type="password"
              value={pass2}
              onChange={(e) => setPass2(e.target.value)}
              placeholder="New passphrase"
              className="font-mono text-xs"
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !pass || pass2.length < 8}
            onClick={() => act(() => secureVault.changePassphrase(pass, pass2))}
          >
            Change passphrase
          </Button>
        </div>
      )}

      {status !== "off" && (
        <p className="mt-3 text-[11px] text-muted-foreground">
          Protected stores: {info.sections.length || MIGRATE.length} · last written{" "}
          {info.updatedAt ? new Date(info.updatedAt).toLocaleString() : "—"}
        </p>
      )}

      {msg && (
        <p className={`mt-2 flex items-center gap-1.5 text-xs ${msg.ok ? "text-success" : "text-destructive"}`}>
          {!msg.ok && <AlertTriangle className="h-3.5 w-3.5" />}
          {msg.text}
        </p>
      )}
    </section>
  );
}
