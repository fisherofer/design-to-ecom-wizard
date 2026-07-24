/**
 * Source Code Bundle Card
 * =======================
 * Standalone Export/Import for the FULL frontend source as a single JSON,
 * compatible with the legacy MarketBrain `CODE_ONLY` backup schema.
 *
 * - Export: every file under /src/** inlined (via Vite import.meta.glob raw),
 *   plus a config map and metadata, downloaded as JSON.
 * - Export Logs: standalone JSON + .log file (separate from the source dump).
 * - Import: parses a JSON bundle, shows a summary, stages it in localStorage
 *   so a backend bridge (/system/restore) can later apply it.
 */

import { useRef, useState } from "react";
import {
  FileJson,
  Download,
  Upload,
  Loader2,
  CheckCircle2,
  ScrollText,
  Code2,
  AlertTriangle,
  Terminal,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  buildSourceBundle,
  downloadJson,
  summariseBundle,
  stageImportedBundle,
  type ImportSummary,
} from "@/lib/sourceExport";
import { api } from "@/lib/api";
import {
  buildBootstrapperBundle,
  buildBackendPackageJson,
  downloadTextFile,
} from "@/lib/bootstrapperExport";

export function SourceBundleCard() {
  const [busy, setBusy] = useState<"idle" | "code" | "logs" | "import">("idle");
  const [lastExport, setLastExport] = useState<{
    fileName: string;
    sizeKb: number;
    files: number;
  } | null>(null);
  const [lastLogs, setLastLogs] = useState<{
    fileName: string;
    sizeKb: number;
    count: number;
  } | null>(null);
  const [imported, setImported] = useState<
    (ImportSummary & { fileName: string }) | null
  >(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleExportCode = () => {
    setBusy("code");
    try {
      const bundle = buildSourceBundle();
      const ts = bundle.meta.timestamp.replace(/[:.]/g, "-");
      const fileName = `CODE_${ts}.json`;
      const size = downloadJson(fileName, bundle);
      setLastExport({
        fileName,
        sizeKb: Math.round(size / 1024),
        files: bundle.code.files.length,
      });
      toast.success(
        `Exported ${bundle.code.files.length} files (${Math.round(size / 1024)} KB)`,
      );
    } catch (e) {
      toast.error(`Export failed: ${(e as Error).message}`);
    } finally {
      setBusy("idle");
    }
  };

  const handleExportLogs = async () => {
    setBusy("logs");
    try {
      const logs = await api.listLogs(undefined, 10_000).catch(() => []);
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const fileName = `LOGS_${ts}.json`;
      const size = downloadJson(fileName, {
        meta: {
          type: "LOGS_ONLY",
          timestamp: new Date().toISOString(),
          version: "aios-logs/v1",
          count: logs?.length ?? 0,
        },
        logs: logs ?? [],
      });

      // Also download a flat .log mirror, like the legacy archive.
      const text = (logs ?? [])
        .map(
          (l) =>
            `[${l.ts}] ${String(l.level).padEnd(5)} ${l.source} — ${l.message}`,
        )
        .join("\n");
      const blob = new Blob([text], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `LOGS_${ts}.log`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setLastLogs({
        fileName,
        sizeKb: Math.round(size / 1024),
        count: logs?.length ?? 0,
      });
      toast.success(`Exported ${logs?.length ?? 0} log entries`);
    } catch (e) {
      toast.error(`Logs export failed: ${(e as Error).message}`);
    } finally {
      setBusy("idle");
    }
  };

  const handleImport = async (file: File) => {
    setBusy("import");
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const summary = summariseBundle(parsed);
      stageImportedBundle(parsed);
      setImported({ ...summary, fileName: file.name });
      toast.success(
        `Loaded ${summary.fileCount} files from ${file.name}. Staged for backend apply.`,
      );
    } catch (e) {
      toast.error(`Import failed: ${(e as Error).message}`);
    } finally {
      setBusy("idle");
    }
  };

  return (
    <Card className="border-border/60 bg-card/40 p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileJson className="h-4 w-4 text-primary" />
          <h3 className="font-display text-sm font-semibold uppercase tracking-wider">
            Full Source Bundle (JSON)
          </h3>
        </div>
        <Badge variant="outline" className="font-mono text-[10px]">
          schema: CODE_ONLY · v1
        </Badge>
      </div>

      <p className="text-xs text-muted-foreground">
        Single-file JSON dump compatible with the legacy MarketBrain
        <span className="mx-1 font-mono">CODE_*.json</span>
        format —{" "}
        <span className="font-mono text-foreground">
          {"{ meta, config, code: { scriptId, files: [...] } }"}
        </span>
        . Logs export to a separate file.
      </p>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <Button
          onClick={handleExportCode}
          disabled={busy !== "idle"}
          size="sm"
          className="justify-start"
        >
          {busy === "code" ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Code2 className="mr-2 h-4 w-4" />
          )}
          Export CODE.json
        </Button>

        <Button
          onClick={handleExportLogs}
          disabled={busy !== "idle"}
          size="sm"
          variant="secondary"
          className="justify-start"
        >
          {busy === "logs" ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <ScrollText className="mr-2 h-4 w-4" />
          )}
          Export LOGS.json
        </Button>

        <Button
          onClick={() => fileRef.current?.click()}
          disabled={busy !== "idle"}
          size="sm"
          variant="outline"
          className="justify-start"
        >
          {busy === "import" ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Upload className="mr-2 h-4 w-4" />
          )}
          Import JSON
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleImport(f);
            e.target.value = "";
          }}
        />
      </div>

      <div className="mt-4 rounded-md border border-primary/25 bg-primary/[0.04] p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-primary" />
            <h4 className="font-display text-xs font-semibold uppercase tracking-wider">
              OFERTRADINGBOT — OS-Independent Bootstrapper
            </h4>
          </div>
          <Badge variant="outline" className="font-mono text-[10px]">
            VENV · Level 9
          </Badge>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Downloads a self-contained boot package: an isolated Python VENV
          orchestrator (root resolved dynamically from{" "}
          <span className="font-mono">__file__</span> — no hardcoded drives)
          and the master integration JSON for Claude / Gemini.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <Button
            size="sm"
            variant="secondary"
            className="justify-start"
            onClick={() => {
              const b = buildBootstrapperBundle();
              downloadTextFile(
                "system_orchestrator.py",
                b.orchestratorPy,
                "text/x-python",
              );
              toast.success("system_orchestrator.py downloaded");
            }}
          >
            <Terminal className="mr-2 h-4 w-4" />
            system_orchestrator.py
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="justify-start"
            onClick={() => {
              const b = buildBootstrapperBundle();
              downloadTextFile(
                "ofer_master_integration.json",
                b.masterJson,
                "application/json",
              );
              toast.success("ofer_master_integration.json downloaded");
            }}
          >
            <FileJson className="mr-2 h-4 w-4" />
            master_integration.json
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="justify-start"
            onClick={() => {
              const b = buildBootstrapperBundle();
              downloadTextFile(
                "BOOTSTRAP_README.md",
                b.readmeMd,
                "text/markdown",
              );
              toast.success("BOOTSTRAP_README.md downloaded");
            }}
          >
            <BookOpen className="mr-2 h-4 w-4" />
            README.md
          </Button>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <Button
            size="sm"
            variant="outline"
            className="justify-start"
            onClick={() => {
              const b = buildBootstrapperBundle();
              downloadTextFile("venv_manager.py", b.venvManagerPy, "text/x-python");
              toast.success("hub/venv_manager.py downloaded");
            }}
          >
            <Code2 className="mr-2 h-4 w-4" />
            hub/venv_manager.py
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="justify-start"
            onClick={() => {
              const b = buildBootstrapperBundle();
              downloadTextFile("venv_routes.py", b.venvRoutesPy, "text/x-python");
              toast.success("hub/venv_routes.py downloaded");
            }}
          >
            <Code2 className="mr-2 h-4 w-4" />
            hub/venv_routes.py
          </Button>
        </div>
        <p className="mt-2 text-[10px] font-mono text-muted-foreground">
          Drop both into <span className="text-foreground">hub/</span> and mount with{" "}
          <span className="text-foreground">
            app.include_router(venv_routes.router, prefix=&quot;/api/venv&quot;)
          </span>
          . The Venv Manager UI (System page) will light up automatically.
        </p>
      </div>



      {(lastExport || lastLogs || imported) && (
        <div className="mt-4 grid gap-2 text-xs">
          {lastExport && (
            <div className="flex items-center gap-2 rounded-md border border-border/60 bg-background/60 px-3 py-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-success" />
              <Download className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-mono">{lastExport.fileName}</span>
              <span className="ml-auto text-muted-foreground">
                {lastExport.files} files · {lastExport.sizeKb} KB
              </span>
            </div>
          )}
          {lastLogs && (
            <div className="flex items-center gap-2 rounded-md border border-border/60 bg-background/60 px-3 py-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-success" />
              <ScrollText className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-mono">{lastLogs.fileName}</span>
              <span className="ml-auto text-muted-foreground">
                {lastLogs.count} entries · {lastLogs.sizeKb} KB
              </span>
            </div>
          )}
          {imported && (
            <div className="rounded-md border border-accent/40 bg-accent/5 px-3 py-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-accent" />
                <span className="font-mono">{imported.fileName}</span>
                <span className="ml-auto text-muted-foreground">
                  {imported.fileCount} files ·{" "}
                  {Math.round(imported.totalBytes / 1024)} KB
                </span>
              </div>
              {imported.meta && (
                <div className="mt-1 text-[11px] text-muted-foreground">
                  schema:{" "}
                  <span className="font-mono">{imported.meta.version}</span> ·
                  exported {new Date(imported.meta.timestamp).toLocaleString()}
                </div>
              )}
              {imported.configKeys.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {imported.configKeys.slice(0, 12).map((k) => (
                    <Badge
                      key={k}
                      variant="secondary"
                      className="font-mono text-[10px]"
                    >
                      {k}
                    </Badge>
                  ))}
                  {imported.configKeys.length > 12 && (
                    <Badge
                      variant="outline"
                      className="font-mono text-[10px]"
                    >
                      +{imported.configKeys.length - 12} more
                    </Badge>
                  )}
                </div>
              )}
              <div className="mt-2 flex items-start gap-1.5 text-[11px] text-warning">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Bundle staged in localStorage. Backend{" "}
                  <span className="font-mono">/system/restore</span> required
                  to write files to disk.
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
