/**
 * Keeps this browser's station in sync with the hive through Drive, on every
 * screen, every 2 minutes — new stations in the shared "stations" folder are
 * picked up automatically. Silently idle when no Drive folder is chosen or the
 * local server is off.
 */
import { useEffect, useRef } from "react";
import { readSettings } from "@/lib/driveSyncSettings";
import { stationSync } from "@/lib/stationSync";

const EVERY_MS = 120_000;

export function useHiveAutoSync() {
  const busy = useRef(false);
  useEffect(() => {
    const tick = async () => {
      if (busy.current) return;
      const folder = readSettings().folderId;
      if (!folder) return;
      busy.current = true;
      try {
        const r = await stationSync.viaDrive(folder);
        if (!r.ok) console.warn("[hive-auto-sync]", r.error);
      } finally {
        busy.current = false;
      }
    };
    const first = setTimeout(() => void tick(), 8000);
    const t = setInterval(() => void tick(), EVERY_MS);
    return () => { clearTimeout(first); clearInterval(t); };
  }, []);
}
