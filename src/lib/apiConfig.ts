/**
 * Single source of truth for backend base URLs.
 *
 * Backend ports are DYNAMIC — do NOT hardcode any URL elsewhere.
 * Resolution order (first hit wins):
 *   1. localStorage override      → key "ai-os.apiBase" / "ai-os.quantApiBase"
 *      (settable at runtime from Settings UI — survives reloads)
 *   2. window global              → window.__API_BASE__ / window.__QUANT_API_BASE__
 *      (settable from index.html or a boot script for staged deploys)
 *   3. Vite env at build time     → VITE_API_BASE_URL / VITE_QUANT_API_BASE_URL
 *   4. Local dev fallback         → http://localhost:8050 / http://localhost:8000
 *
 * When the backend switches to dynamic port discovery (planned), it will
 * write the resolved URL into localStorage via /api/ports handshake and every
 * consumer picks it up automatically — no code edits, no rebuild.
 */

const LS_HUB = "ai-os.apiBase";
const LS_QUANT = "ai-os.quantApiBase";

const DEFAULT_HUB = "http://localhost:8050";
const DEFAULT_QUANT = "http://localhost:8000";

type Win = Window & {
  __API_BASE__?: string;
  __QUANT_API_BASE__?: string;
};

function resolve(lsKey: string, winKey: keyof Win, viteKey: string, fallback: string): string {
  if (typeof window !== "undefined") {
    try {
      const stored = window.localStorage.getItem(lsKey);
      if (stored && stored.trim()) return stored.trim().replace(/\/$/, "");
    } catch {
      /* private mode / SSR */
    }
    const w = window as Win;
    const globalVal = w[winKey];
    if (typeof globalVal === "string" && globalVal.trim()) return globalVal.trim().replace(/\/$/, "");
  }
  const envVal = (import.meta.env as Record<string, string | undefined>)[viteKey];
  if (envVal && envVal.trim()) return envVal.trim().replace(/\/$/, "");
  return fallback;
}

export function getApiBase(): string {
  return resolve(LS_HUB, "__API_BASE__", "VITE_API_BASE_URL", DEFAULT_HUB);
}

export function getQuantApiBase(): string {
  return resolve(LS_QUANT, "__QUANT_API_BASE__", "VITE_QUANT_API_BASE_URL", DEFAULT_QUANT);
}

export function setApiBase(url: string): void {
  if (typeof window === "undefined") return;
  const clean = url.trim().replace(/\/$/, "");
  if (clean) window.localStorage.setItem(LS_HUB, clean);
  else window.localStorage.removeItem(LS_HUB);
}

export function setQuantApiBase(url: string): void {
  if (typeof window === "undefined") return;
  const clean = url.trim().replace(/\/$/, "");
  if (clean) window.localStorage.setItem(LS_QUANT, clean);
  else window.localStorage.removeItem(LS_QUANT);
}
