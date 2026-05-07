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
} from "lucide-react";
import { cn } from "@/lib/utils";
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

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Providers · Local Models · Rate Limits · GitHub · Theme Engine
          </p>
        </div>
      </header>

      <div className="flex flex-wrap gap-2 border-b border-border">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "flex items-center gap-2 rounded-t-md border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
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
    </div>
  );
}
