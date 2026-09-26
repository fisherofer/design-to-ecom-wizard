/**
 * Runs the Google Drive backup automatically:
 *   • once shortly after the app starts (if enabled and a target folder is set)
 *   • whenever the local state changes (debounced poll, if enabled)
 *
 * Everything is opt-in from the "Drive Sync" screen and silently no-ops when no
 * folder has been chosen.
 */
import { useEffect, useRef } from "react";
import {
  collectMemoryPayload,
  markRun,
  profileFingerprint,
  readSettings,
  readStoredFingerprint,
  writeStoredFingerprint,
} from "@/lib/driveSyncSettings";
import { driveActiveSync, driveFullBackup } from "@/lib/driveSync.functions";

const CHECK_MS = 30_000;

export function useDriveAutoBackup() {
  const running = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const run = async (reason: "start" | "change") => {
      if (running.current) return;
      const s = readSettings();
      if (!s.folderId) return;
      if (reason === "start" && !s.backupOnStart) return;
      if (reason === "change" && !s.syncOnChange) return;
      running.current = true;
      try {
        const memory = await collectMemoryPayload();
        await driveFullBackup({ data: { folderId: s.folderId, memory, label: `auto:${reason}` } });
        await driveActiveSync({ data: { folderId: s.folderId, mirrorFolder: s.mirrorFolder } });
        markRun();
      } catch (e) {
        console.warn("[drive-auto-backup]", e instanceof Error ? e.message : e);
      } finally {
        running.current = false;
      }
    };

    const startTimer = setTimeout(() => {
      if (!cancelled) void run("start");
    }, 4000);

    const interval = setInterval(() => {
      if (cancelled) return;
      const fp = profileFingerprint();
      if (fp && fp !== readStoredFingerprint()) {
        writeStoredFingerprint(fp);
        void run("change");
      }
    }, CHECK_MS);

    return () => {
      cancelled = true;
      clearTimeout(startTimer);
      clearInterval(interval);
    };
  }, []);
}
