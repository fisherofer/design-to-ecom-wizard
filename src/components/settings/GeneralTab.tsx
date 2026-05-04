/** General tab: read-only environment summary. */
import { Row } from "./Field";

export function GeneralTab() {
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h2 className="font-display text-lg font-semibold">General</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Application-wide preferences. Use the dedicated tabs to manage providers,
        Ollama, GitHub, theme, and rate limits.
      </p>
      <div className="mt-4 grid gap-3 text-sm">
        <Row label="Backend URL" value="http://localhost:8000" />
        <Row label="Theme storage" value="localStorage · ai-os.theme.tokens" />
        <Row label="Rate limits storage" value="localStorage · ai-os.rateLimits.v1" />
        <Row label="Discovery mode" value="Browser-direct (CORS permitting) · curated fallback" />
      </div>
    </div>
  );
}
