/**
 * Daily cron endpoint — mirrors every enabled drive_backup_targets row to
 * Google Drive under its configured root folder (default AI/LOVEABLE).
 *
 * Called by pg_cron with `apikey` header set to Supabase publishable key.
 * The route is public (bypasses auth on /api/public/*), so we still require
 * the header to be present as a soft gate against random pings.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/drive-backup-daily")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey");
        if (!apiKey) {
          return new Response(JSON.stringify({ error: "missing apikey header" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { syncRepoToDrive } = await import("@/lib/driveBackup.functions");

        const { data: targets, error } = await supabaseAdmin
          .from("drive_backup_targets")
          .select("*")
          .eq("enabled", true)
          .limit(50);

        if (error) {
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const results: Array<{ id: string; repo: string; ok: boolean; uploaded?: number; error?: string }> = [];

        for (const t of targets ?? []) {
          try {
            const r = await syncRepoToDrive({
              data: {
                repoUrl: t.repo_url,
                token: t.token ?? undefined,
                rootFolder: t.root_folder,
              },
            });
            await supabaseAdmin
              .from("drive_backup_targets")
              .update({
                last_run_at: new Date().toISOString(),
                last_status: r.ok ? "ok" : "error",
                last_uploaded: r.uploaded ?? 0,
                last_error: r.ok ? null : r.error ?? "unknown",
              })
              .eq("id", t.id);
            results.push({ id: t.id, repo: t.repo_url, ok: r.ok, uploaded: r.uploaded, error: r.error });
          } catch (e) {
            const msg = (e as Error).message;
            await supabaseAdmin
              .from("drive_backup_targets")
              .update({
                last_run_at: new Date().toISOString(),
                last_status: "error",
                last_error: msg,
              })
              .eq("id", t.id);
            results.push({ id: t.id, repo: t.repo_url, ok: false, error: msg });
          }
        }

        return new Response(
          JSON.stringify({ ok: true, ran: results.length, results }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
