/**
 * Drive backup targets — CRUD server functions.
 * Each row = one repo the daily cron mirrors into Google Drive.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export interface DriveBackupTarget {
  id: string;
  owner_session: string;
  repo_url: string;
  token: string | null;
  root_folder: string;
  enabled: boolean;
  last_run_at: string | null;
  last_status: string | null;
  last_uploaded: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export const listBackupTargets = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) =>
    z.object({ ownerSession: z.string().min(6) }).parse(raw),
  )
  .handler(async ({ data }): Promise<DriveBackupTarget[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("drive_backup_targets")
      .select("*")
      .eq("owner_session", data.ownerSession)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as DriveBackupTarget[];
  });

export const upsertBackupTarget = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) =>
    z
      .object({
        ownerSession: z.string().min(6),
        repoUrl: z.string().min(1),
        token: z.string().optional(),
        rootFolder: z.string().default("AI/LOVEABLE"),
        enabled: z.boolean().default(true),
      })
      .parse(raw),
  )
  .handler(async ({ data }): Promise<DriveBackupTarget> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("drive_backup_targets")
      .upsert(
        {
          owner_session: data.ownerSession,
          repo_url: data.repoUrl,
          token: data.token ?? null,
          root_folder: data.rootFolder,
          enabled: data.enabled,
        },
        { onConflict: "owner_session,repo_url" },
      )
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row as DriveBackupTarget;
  });

export const deleteBackupTarget = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) =>
    z.object({ ownerSession: z.string().min(6), id: z.string().uuid() }).parse(raw),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("drive_backup_targets")
      .delete()
      .eq("id", data.id)
      .eq("owner_session", data.ownerSession);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Run one target now (manual "sync now" from UI). */
export const runBackupTargetNow = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) =>
    z.object({ ownerSession: z.string().min(6), id: z.string().uuid() }).parse(raw),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("drive_backup_targets")
      .select("*")
      .eq("id", data.id)
      .eq("owner_session", data.ownerSession)
      .maybeSingle();
    if (error || !row) return { ok: false, error: error?.message ?? "not found" };

    const { syncRepoToDrive } = await import("./driveBackup.functions");
    const res = await syncRepoToDrive({
      data: {
        repoUrl: row.repo_url,
        token: row.token ?? undefined,
        rootFolder: row.root_folder,
      },
    });

    await supabaseAdmin
      .from("drive_backup_targets")
      .update({
        last_run_at: new Date().toISOString(),
        last_status: res.ok ? "ok" : "error",
        last_uploaded: res.uploaded ?? 0,
        last_error: res.ok ? null : res.error ?? "unknown",
      })
      .eq("id", data.id);

    return { ok: res.ok, uploaded: res.uploaded, skipped: res.skipped, error: res.error };
  });
