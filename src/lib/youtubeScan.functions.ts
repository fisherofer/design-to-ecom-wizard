import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export interface FoundChannel {
  handle: string;
  name: string;
  url: string;
}

/** Reads YouTube's public channel search page and extracts real channel handles. */
export const scanYoutubeChannels = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) =>
    z.object({ query: z.string().min(2).max(120), limit: z.number().int().min(1).max(40).default(20) }).parse(raw),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; channels: FoundChannel[]; error?: string }> => {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(data.query)}&sp=EgIQAg%253D%253D`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15_000);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { "accept-language": "en-US,en;q=0.9", "user-agent": "Mozilla/5.0" },
      });
      if (!res.ok) return { ok: false, channels: [], error: `YouTube responded ${res.status}` };
      const html = await res.text();
      const seen = new Map<string, FoundChannel>();
      const re = /"channelRenderer":\{"channelId":"[^"]+","title":\{"simpleText":"([^"]+)"\}[\s\S]{0,3000}?"canonicalBaseUrl":"\/(@[^"]+)"/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(html)) && seen.size < data.limit) {
        const handle = m[2];
        if (!seen.has(handle)) seen.set(handle, { handle, name: m[1], url: `https://www.youtube.com/${handle}` });
      }
      if (seen.size === 0) return { ok: false, channels: [], error: "No channels found in the YouTube response" };
      return { ok: true, channels: [...seen.values()] };
    } catch (e) {
      return { ok: false, channels: [], error: (e as Error).message };
    } finally {
      clearTimeout(t);
    }
  });
