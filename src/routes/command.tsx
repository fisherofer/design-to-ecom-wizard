/**
 * Quant Command — unified operational cockpit for OFERTRADINGBOT.
 * Combines system health, the AI Agent Fleet Manager, and the Drive
 * Intelligence Hub. All data comes from the local FastAPI backend
 * (see src/services/api.ts).
 */
import { createFileRoute } from "@tanstack/react-router";
import { SystemHealthBanner } from "@/components/quant/SystemHealthBanner";
import { AgentFleetManager } from "@/components/quant/AgentFleetManager";
import { DriveIntelligenceHub } from "@/components/quant/DriveIntelligenceHub";

export const Route = createFileRoute("/command")({
  head: () => ({
    meta: [
      { title: "Quant Command — OFERTRADINGBOT" },
      {
        name: "description",
        content:
          "Operational cockpit: system health, AI agent fleet, and Google Drive knowledge base for the local trading OS.",
      },
    ],
  }),
  component: CommandPage,
});

function CommandPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-5 p-3 sm:space-y-6 sm:p-6">
      <header className="min-w-0">
        <h1 className="truncate font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          Quant Command
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Local-first cockpit — FastAPI · Ollama · Drive Knowledge · Agent Fleet
        </p>
      </header>

      <SystemHealthBanner />
      <AgentFleetManager />
      <DriveIntelligenceHub />
    </div>
  );
}
