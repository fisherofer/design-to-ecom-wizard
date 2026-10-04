/**
 * Hive relay — lets a headless station (no browser open) exchange its change log
 * with the other stations through the owner's Google Drive.
 * Auth: Bearer HIVE_RELAY_TOKEN (a passphrase the owner sets once, typed into each station).
 */
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
import { z } from "zod";
import { DRIVE_V3, creds, ensureChain, findChild, gw, headers, uploadBytes, type DriveEntry } from "@/lib/driveSync.functions";

const Body = z.object({
  stationId: z.string().min(3).max(120).regex(/^[\w.:-]+$/),
  folderId: z.string().min(5).max(200).regex(/^[\w-]+$/),
  payload: z.string().max(20_000_000),
});

function authorized(req: Request): boolean {
  const want = process.env["HIVE_RELAY_TOKEN"];
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!want || !got || want.length !== got.length) return false;
  return timingSafeEqual(Buffer.from(want), Buffer.from(got));
}

export const Route = createFileRoute("/api/public/hive/relay")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!process.env["HIVE_RELAY_TOKEN"]) return Response.json({ ok: false, error: "relay passphrase not set on the server" }, { status: 503 });
        if (!authorized(request)) return Response.json({ ok: false, error: "wrong relay passphrase" }, { status: 401 });
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ ok: false, error: "bad request" }, { status: 400 });
        if (!creds()) return Response.json({ ok: false, error: "Google Drive not connected" }, { status: 503 });
        const { stationId, folderId, payload } = parsed.data;
        try {
          const dir = await ensureChain(folderId, ["stations"], new Map());
          const self = `${stationId.replace(/[^\w.-]/g, "_")}.json`;
          const existing = await findChild(self, dir, false);
          await uploadBytes(dir, self, payload, "application/json", existing?.id);
          const q = `'${dir}' in parents and trashed=false`;
          const r = await gw(`${DRIVE_V3}/files?q=${encodeURIComponent(q)}&fields=files(id,name,modifiedTime)&pageSize=200`, { headers: headers() });
          if (!r.ok) return Response.json({ ok: false, error: `Drive ${r.status}: ${await r.text()}` }, { status: 502 });
          const list = ((await r.json()) as { files?: DriveEntry[] }).files ?? [];
          const files: Array<{ name: string; content: string }> = [];
          for (const f of list) {
            if (f.name === self || !f.name.endsWith(".json")) continue;
            const fr = await gw(`${DRIVE_V3}/files/${f.id}?alt=media`, { headers: headers() });
            if (fr.ok) files.push({ name: f.name, content: await fr.text() });
          }
          return Response.json({ ok: true, files });
        } catch (e) {
          return Response.json({ ok: false, error: (e as Error).message }, { status: 502 });
        }
      },
    },
  },
});
