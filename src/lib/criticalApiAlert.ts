/**
 * criticalApiAlert — raises a critical, deduped notification when a feature
 * requires an external API that has failed AND there are no fallback keys
 * or alternative providers left. Intended for widgets/services to call when
 * they detect an unrecoverable API failure.
 */
import { notifications } from "./notifications";
import { keyVault } from "./apiKeyVault";
import type { ProviderId } from "./modelDiscovery";

const COOLDOWN_MS = 5 * 60_000; // 5 minutes
const lastRaised = new Map<string, number>();

export interface CriticalFailureInput {
  /** Human name of the feature that broke (e.g. "AI Recommendations"). */
  feature: string;
  /** Providers that could satisfy this feature. */
  providers: ProviderId[];
  /** The provider that just failed. */
  failedProvider: ProviderId;
  /** Optional error string from the upstream. */
  error?: string;
  /** Reason category — surfaced to the user. */
  reason?: "quota" | "auth" | "network" | "unknown";
}

/**
 * Raise a critical alert if no fallback key/provider remains. Deduped per
 * (feature, failedProvider) for 5 minutes so we don't spam the bell.
 */
export function raiseCriticalApiFailure(input: CriticalFailureInput): boolean {
  const { feature, providers, failedProvider, error, reason = "unknown" } = input;
  const dedupeKey = `${feature}::${failedProvider}`;
  const now = Date.now();
  const last = lastRaised.get(dedupeKey) ?? 0;
  if (now - last < COOLDOWN_MS) return false;

  // Are there active alternative keys on OTHER providers?
  const alternatives = providers.filter((p) => p !== failedProvider);
  const fallback = keyVault.anyActive(alternatives);
  const hasFallback = fallback !== null;

  // Are there other active keys on the SAME provider (rotation)?
  const sameProviderKeys = keyVault.list(failedProvider).filter((k) => k.status === "active");
  const hasSameProviderRotation = sameProviderKeys.length > 0;

  if (hasFallback || hasSameProviderRotation) return false;

  lastRaised.set(dedupeKey, now);
  const reasonText: Record<string, string> = {
    quota: "credits/quota exhausted",
    auth: "invalid or missing key",
    network: "network/upstream error",
    unknown: "unspecified failure",
  };
  notifications.push({
    level: "critical",
    title: `${feature} is offline`,
    message: `${failedProvider}: ${reasonText[reason]}${error ? ` — ${error}` : ""}. No fallback keys or alternative providers are configured.`,
    href: "/settings",
  });
  return true;
}
