/**
 * Drive Gap Report — surfaces drift between live code and last Drive snapshot,
 * across ALL drive_backup_targets rows (not scoped to owner_session).
 * Since we can't diff file trees without repo auth, freshness = hours since
 * last successful sync. Each target is classified as fresh / stale / broken.
 */
import { createServerFn } from "@tanstack/react-start";

export type Freshness = "fresh" | "stale" | "broken" | "disabled" | "never";

export interface GapTarget {
  id: string;
  repo_url: string;
  root_folder: string;
  enabled: boolean;
  last_run_at: string | null;
  last_status: string | null;
  last_uploaded: number;
  last_error: string | null;
  hours_since: number | null;
  freshness: Freshness;
}

export interface GapReport {
  generated_at: string;
  total: number;
  fresh: number;
  stale: number;
  broken: number;
  disabled: number;
  never: number;
  targets: GapTarget[];
}

function classify(row: {
  enabled: boolean;
  last_run_at: string | null;
  last_status: string | null;
}): { freshness: Freshness; hours_since: number | null } {
  if (!row.enabled) return { freshness: "disabled", hours_since: null };
  if (!row.last_run_at) return { freshness: "never", hours_since: null };
  const hours = (Date.now() - new Date(row.last_run_at).getTime()) / 3_600_000;
  if (row.last_status !== "ok") return { freshness: "broken", hours_since: hours };
  if (hours > 30) return { freshness: "stale", hours_since: hours };
  return { freshness: "fresh", hours_since: hours };
}

export const getDriveGapReport = createServerFn({ method: "GET" })
  .handler(async (): Promise<GapReport> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("drive_backup_targets")
      .select("id, repo_url, root_folder, enabled, last_run_at, last_status, last_uploaded, last_error")
      .order("last_run_at", { ascending: false, nullsFirst: false })
      .limit(200);
    if (error) throw new Error(error.message);

    const targets: GapTarget[] = (rows ?? []).map((r) => {
      const c = classify(r);
      return { ...r, hours_since: c.hours_since, freshness: c.freshness };
    });

    const counts = { fresh: 0, stale: 0, broken: 0, disabled: 0, never: 0 };
    for (const t of targets) counts[t.freshness]++;

    return {
      generated_at: new Date().toISOString(),
      total: targets.length,
      ...counts,
      targets,
    };
  });
