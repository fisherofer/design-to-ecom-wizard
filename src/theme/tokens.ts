/**
 * Theme Tokens — Single Source of Truth for Visuals
 * ===================================================
 * Edit colors here OR via Settings → Theme. Changes are pushed to CSS vars
 * at runtime by `applyTheme()` and persisted to localStorage so the AI can
 * reason about and modify the design without touching `styles.css`.
 *
 * All colors are oklch strings. The defaults mirror the Cyberpunk Terminal
 * design currently in `src/styles.css`.
 */

export type ThemeTokens = {
  // Surfaces
  background: string;
  foreground: string;
  surface: string;
  surfaceElevated: string;
  card: string;
  cardForeground: string;

  // Brand
  primary: string;
  primaryForeground: string;
  primaryGlow: string;
  accent: string;
  accentForeground: string;

  // Semantic
  success: string;
  warning: string;
  destructive: string;
  info: string;

  // Sidebar
  sidebar: string;
  sidebarAccent: string;
  sidebarBorder: string;

  // Effects
  borderOpacity: string; // alpha value 0..1 for borders
  radius: string; // rem
  terminalBg: string;

  // Typography (font families)
  fontSans: string;
  fontDisplay: string;
  fontMono: string;
};

export const DEFAULT_TOKENS: ThemeTokens = {
  background: "oklch(0.16 0.025 260)",
  foreground: "oklch(0.96 0.005 260)",
  surface: "oklch(0.20 0.028 260)",
  surfaceElevated: "oklch(0.235 0.03 260)",
  card: "oklch(0.20 0.028 260)",
  cardForeground: "oklch(0.96 0.005 260)",

  primary: "oklch(0.72 0.18 235)",
  primaryForeground: "oklch(0.14 0.025 260)",
  primaryGlow: "oklch(0.78 0.20 215)",
  accent: "oklch(0.65 0.22 305)",
  accentForeground: "oklch(0.98 0 0)",

  success: "oklch(0.72 0.20 150)",
  warning: "oklch(0.80 0.17 85)",
  destructive: "oklch(0.65 0.24 25)",
  info: "oklch(0.72 0.18 235)",

  sidebar: "oklch(0.14 0.022 260)",
  sidebarAccent: "oklch(0.22 0.028 260)",
  sidebarBorder: "oklch(1 0 0 / 6%)",

  borderOpacity: "0.08",
  radius: "0.625rem",
  terminalBg: "oklch(0.10 0.02 260)",

  fontSans: '"Inter", "Segoe UI", system-ui, sans-serif',
  fontDisplay: '"Space Grotesk", "Inter", sans-serif',
  fontMono: '"JetBrains Mono", "Fira Code", "Menlo", monospace',
};

const CSS_VAR_MAP: Record<keyof ThemeTokens, string> = {
  background: "--background",
  foreground: "--foreground",
  surface: "--surface",
  surfaceElevated: "--surface-elevated",
  card: "--card",
  cardForeground: "--card-foreground",
  primary: "--primary",
  primaryForeground: "--primary-foreground",
  primaryGlow: "--primary-glow",
  accent: "--accent",
  accentForeground: "--accent-foreground",
  success: "--success",
  warning: "--warning",
  destructive: "--destructive",
  info: "--info",
  sidebar: "--sidebar",
  sidebarAccent: "--sidebar-accent",
  sidebarBorder: "--sidebar-border",
  borderOpacity: "--border-opacity",
  radius: "--radius",
  terminalBg: "--terminal-bg",
  fontSans: "--font-sans",
  fontDisplay: "--font-display",
  fontMono: "--font-mono",
};

const STORAGE_KEY = "ai-os.theme.tokens";

export function loadTheme(): ThemeTokens {
  if (typeof window === "undefined") return DEFAULT_TOKENS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_TOKENS;
    return { ...DEFAULT_TOKENS, ...(JSON.parse(raw) as Partial<ThemeTokens>) };
  } catch {
    return DEFAULT_TOKENS;
  }
}

export function saveTheme(tokens: ThemeTokens): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
}

export function resetTheme(): ThemeTokens {
  if (typeof window !== "undefined") localStorage.removeItem(STORAGE_KEY);
  applyTheme(DEFAULT_TOKENS);
  return DEFAULT_TOKENS;
}

export function applyTheme(tokens: ThemeTokens): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  (Object.keys(CSS_VAR_MAP) as Array<keyof ThemeTokens>).forEach((k) => {
    root.style.setProperty(CSS_VAR_MAP[k], tokens[k]);
  });
  // Derived: keep border alpha in sync.
  root.style.setProperty(
    "--border",
    `oklch(1 0 0 / ${Number(tokens.borderOpacity) * 100}%)`,
  );
}

export function exportTheme(tokens: ThemeTokens): string {
  return JSON.stringify(tokens, null, 2);
}

export function importTheme(json: string): ThemeTokens {
  const parsed = JSON.parse(json) as Partial<ThemeTokens>;
  return { ...DEFAULT_TOKENS, ...parsed };
}
