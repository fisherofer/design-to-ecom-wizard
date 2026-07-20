/**
 * Venv Manager API client — thin wrapper over hub/venv_routes.py (FastAPI).
 * Real replacement for the AI Studio prototype's fake `venvPackages` array:
 * the UI must NEVER fabricate venv state — it only renders what the backend
 * returns. If the backend is offline, we surface that explicitly (no mock).
 */
import { getApiBase } from "./apiConfig";

export interface VenvPackage {
  name: string;
  version: string;
}

export interface VenvHealth {
  ok: boolean;
  venv_exists: boolean;
  python_version?: string | null;
  installed_count?: number;
  required_count?: number;
  missing?: string[];
}

export interface VenvStatus {
  ok: boolean;
  os: "windows" | "posix";
  host_python: string;
  venv_dir: string;
  venv_exists: boolean;
  venv_python_version: string | null;
  disk_usage_bytes: number;
  packages: VenvPackage[];
  health: VenvHealth;
}

const TIMEOUT_MS = 15_000;

async function call<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${getApiBase()}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, data: (await res.json()) as T };
  } catch (err) {
    return { ok: false, error: (err as Error).message || "network error" };
  } finally {
    clearTimeout(timer);
  }
}

export const venvApi = {
  status: () => call<VenvStatus>("/api/venv/status"),
  create: () => call<{ ok: boolean; created: boolean }>("/api/venv/create", { method: "POST" }),
  heal: () => call<{ ok: boolean; action: string }>("/api/venv/heal", { method: "POST" }),
  recreate: () => call<{ ok: boolean }>("/api/venv/recreate", { method: "POST" }),
  install: (pkg: string) =>
    call<{ ok: boolean }>("/api/venv/install", {
      method: "POST",
      body: JSON.stringify({ package: pkg }),
    }),
  uninstall: (pkg: string) =>
    call<{ ok: boolean }>("/api/venv/uninstall", {
      method: "POST",
      body: JSON.stringify({ package: pkg }),
    }),
  packages: () => call<{ packages: VenvPackage[] }>("/api/venv/packages"),
};
