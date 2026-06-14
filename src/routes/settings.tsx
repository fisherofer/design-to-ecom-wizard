/**
 * Settings — slim tab router only.
 * Each tab lives in its own file under src/components/settings/* so the AI
 * can edit a single concern without scrolling through hundreds of lines.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Settings as SettingsIcon,
  Cpu,
  KeyRound,
  Github,
  Palette,
  Activity,
  RefreshCw,
  Globe,
  ShieldCheck,
  Save,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { GeneralTab } from "@/components/settings/GeneralTab";
import { ApiProvidersTab } from "@/components/settings/ApiProvidersTab";
import { OllamaTab } from "@/components/settings/OllamaTab";
import { GithubTab } from "@/components/settings/GithubTab";
import { ThemeTab } from "@/components/settings/ThemeTab";
import { RateLimitsTab } from "@/components/settings/RateLimitsTab";
import { RefreshTab } from "@/components/settings/RefreshTab";
import { ModelHubTab } from "@/components/settings/ModelHubTab";
import { ModelFiltersTab } from "@/components/settings/ModelFiltersTab";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — AI Executive OS" },
      {
        name: "description",
        content:
          "Manage providers, discover models, configure Ollama, GitHub, theme tokens, and rate limits.",
      },
    ],
  }),
  component: SettingsPage,
});

type TabId = "general" | "api" | "ollama" | "hub" | "filters" | "limits" | "refresh" | "github" | "theme";

const TABS: Array<{ id: TabId; label: string; Icon: typeof SettingsIcon }> = [
  { id: "general", label: "General", Icon: SettingsIcon },
  { id: "api", label: "API Providers", Icon: KeyRound },
  { id: "ollama", label: "Ollama Manager", Icon: Cpu },
  { id: "hub", label: "Model Hub", Icon: Globe },
  { id: "filters", label: "Model Filters", Icon: ShieldCheck },
  { id: "limits", label: "Rate Limits", Icon: Activity },
  { id: "refresh", label: "Refresh", Icon: RefreshCw },
  { id: "github", label: "GitHub", Icon: Github },
  { id: "theme", label: "Theme", Icon: Palette },
];

function SettingsPage() {
  const [tab, setTab] = useState<TabId>("api");
  const [saved, setSaved] = useState(false);

  function saveSettings() {
    localStorage.setItem("ai-os.settings.lastSaved", new Date().toISOString());
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-3 pb-24 sm:space-y-6 sm:p-6 sm:pb-24">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
        <div className="min-w-0">
          <h1 className="truncate font-display text-2xl font-semibold tracking-tight sm:text-3xl">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Providers · Local Models · Rate Limits · GitHub · Theme Engine
          </p>
        </div>
        <Button onClick={saveSettings} className="hidden sm:inline-flex">
          {saved ? <Check /> : <Save />}
          {saved ? "Saved" : "Save settings"}
        </Button>
      </header>

      <div className="-mx-3 flex gap-1 overflow-x-auto border-b border-border px-3 sm:mx-0 sm:flex-wrap sm:gap-2 sm:px-0">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-t-md border-b-2 px-3 py-2.5 text-sm font-medium transition-colors sm:px-4",
              tab === id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === "general" && <GeneralTab />}
      {tab === "api" && <ApiProvidersTab />}
      {tab === "ollama" && <OllamaTab />}
      {tab === "hub" && <ModelHubTab />}
      {tab === "filters" && <ModelFiltersTab />}
      {tab === "limits" && <RateLimitsTab />}
      {tab === "refresh" && <RefreshTab />}
      {tab === "github" && <GithubTab />}
      {tab === "theme" && <ThemeTab />}

      <div className="fixed inset-x-0 bottom-7 z-20 border-t border-border bg-background/90 py-3 pl-3 pr-20 backdrop-blur-xl sm:px-6 md:left-[240px]">
        <div className="mx-auto flex max-w-7xl items-center justify-end gap-3 sm:justify-between">
          <span className="hidden truncate text-xs text-muted-foreground sm:block">Changes are kept locally in this browser.</span>
          <Button onClick={saveSettings} className="shrink-0">
            {saved ? <Check /> : <Save />}
            {saved ? "Saved" : "Save settings"}
          </Button>
        </div>
      </div>
    </div>
  );
}
