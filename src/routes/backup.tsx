import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef } from "react";
import JSZip from "jszip";
import {
  Download,
  Upload,
  Archive,
  FileJson,
  ScrollText,
  Settings as SettingsIcon,
  Database,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  HardDriveDownload,
  HardDriveUpload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/lib/api";
import { toast } from "sonner";

export const Route = createFileRoute("/backup")({
  head: () => ({
    meta: [
      { title: "Backup & Restore — AI Executive OS" },
      {
        name: "description",
        content:
          "Export and import the full system snapshot: source code, configuration, API vault, personas, and complete logs.",
      },
    ],
  }),
  component: BackupRestorePage,
});

type SectionKey =
  | "code"
  | "config"
  | "vault"
  | "personas"
  | "proposals"
  | "logs"
  | "localStorage";

interface SectionDef {
  key: SectionKey;
  label: string;
  description: string;
  icon: typeof FileJson;
}

const SECTIONS: SectionDef[] = [
  {
    key: "code",
    label: "Frontend Source (manifest)",
    description:
      "List of all React/TS files. Real source ZIP requires backend endpoint /system/source.",
    icon: Archive,
  },
  {
    key: "config",
    label: "System Config Parameters",
    description: "All editable parameters from /config/params.",
    icon: SettingsIcon,
  },
  {
    key: "vault",
    label: "API Vault (masked)",
    description: "Provider keys, tiers, use-cases. Keys are masked for safety.",
    icon: Database,
  },
  {
    key: "personas",
    label: "Personas & Theses",
    description: "Tracked creators, trust scores, active investment theses.",
    icon: FileJson,
  },
  {
    key: "proposals",
    label: "Meta-Agent Proposals",
    description: "Evolution Hub strategy proposals and audit results.",
    icon: FileJson,
  },
  {
    key: "logs",
    label: "Full System Logs",
    description: "All log entries (ERROR / WARN / INFO / DEBUG).",
    icon: ScrollText,
  },
  {
    key: "localStorage",
    label: "Local UI State",
    description: "Chat opacity, theme prefs, draggable positions, etc.",
    icon: HardDriveDownload,
  },
];

interface ExportResult {
  ts: string;
  sizeKb: number;
  fileName: string;
  sections: SectionKey[];
  errors: string[];
}

function BackupRestorePage() {
  const [selected, setSelected] = useState<Set<SectionKey>>(
    new Set(SECTIONS.map((s) => s.key)),
  );
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [lastExport, setLastExport] = useState<ExportResult | null>(null);
  const [importPreview, setImportPreview] = useState<{
    fileName: string;
    sections: string[];
    ts?: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggle = (k: SectionKey) => {
    const next = new Set(selected);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    setSelected(next);
  };

  const allSelected = selected.size === SECTIONS.length;
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(SECTIONS.map((s) => s.key)));
  };

  const collectLocalStorage = (): Record<string, string> => {
    if (typeof window === "undefined") return {};
    const out: Record<string, string> = {};
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k) out[k] = window.localStorage.getItem(k) ?? "";
    }
    return out;
  };

  const handleExport = async () => {
    setExporting(true);
    const errors: string[] = [];
    const zip = new JSZip();
    const ts = new Date().toISOString();

    try {
      const manifest = {
        app: "AI Executive OS",
        version: "1.0.0",
        exportedAt: ts,
        sections: Array.from(selected),
      };
      zip.file("manifest.json", JSON.stringify(manifest, null, 2));

      const fetches: Array<Promise<void>> = [];

      if (selected.has("code")) {
        // Best-effort: real ZIP requires backend. We embed a manifest of
        // the routes/components the UI knows about.
        const codeManifest = {
          note: "For full source export, hit POST /system/source on the FastAPI bridge.",
          routes: [
            "/", "/intelligence", "/personas", "/agents", "/strategy",
            "/api-vault", "/config", "/system", "/terminal", "/backup",
          ],
          generatedAt: ts,
        };
        zip.file("code/manifest.json", JSON.stringify(codeManifest, null, 2));
      }

      if (selected.has("config")) {
        fetches.push(
          api
            .listParams()
            .then((d) => {
              zip.file("config/params.json", JSON.stringify(d, null, 2));
            })
            .catch((e) => errors.push(`config: ${(e as Error).message}`)),
        );
      }
      if (selected.has("vault")) {
        fetches.push(
          api
            .listKeys()
            .then((d) => {
              zip.file("vault/keys.json", JSON.stringify(d, null, 2));
            })
            .catch((e) => errors.push(`vault: ${(e as Error).message}`)),
        );
      }
      if (selected.has("personas")) {
        fetches.push(
          api
            .listPersonas()
            .then((d) => {
              zip.file("personas/personas.json", JSON.stringify(d, null, 2));
            })
            .catch((e) => errors.push(`personas: ${(e as Error).message}`)),
        );
      }
      if (selected.has("proposals")) {
        fetches.push(
          api
            .listProposals()
            .then((d) => {
              zip.file(
                "evolution/proposals.json",
                JSON.stringify(d, null, 2),
              );
            })
            .catch((e) => errors.push(`proposals: ${(e as Error).message}`)),
        );
      }
      if (selected.has("logs")) {
        fetches.push(
          api
            .listLogs(undefined, 10_000)
            .then((logs) => {
              zip.file("logs/full.json", JSON.stringify(logs, null, 2));
              const text = (logs ?? [])
                .map(
                  (l) =>
                    `[${l.ts}] ${l.level.padEnd(5)} ${l.source} — ${l.message}`,
                )
                .join("\n");
              zip.file("logs/full.log", text);
            })
            .catch((e) => errors.push(`logs: ${(e as Error).message}`)),
        );
      }
      if (selected.has("localStorage")) {
        const ls = collectLocalStorage();
        zip.file("ui-state/localStorage.json", JSON.stringify(ls, null, 2));
      }

      await Promise.allSettled(fetches);

      const blob = await zip.generateAsync({ type: "blob" });
      const fileName = `ai-exec-os-backup-${ts.replace(/[:.]/g, "-")}.zip`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setLastExport({
        ts,
        sizeKb: Math.round(blob.size / 1024),
        fileName,
        sections: Array.from(selected),
        errors,
      });

      if (errors.length === 0) {
        toast.success(`Backup exported (${Math.round(blob.size / 1024)} KB)`);
      } else {
        toast.warning(`Exported with ${errors.length} warning(s)`);
      }
    } catch (e) {
      toast.error(`Export failed: ${(e as Error).message}`);
    } finally {
      setExporting(false);
    }
  };

  const handleFilePicked = async (file: File) => {
    setImporting(true);
    try {
      const zip = await JSZip.loadAsync(file);
      const manifestEntry = zip.file("manifest.json");
      let manifest: { exportedAt?: string; sections?: string[] } = {};
      if (manifestEntry) {
        manifest = JSON.parse(await manifestEntry.async("string"));
      }
      const sections = Object.keys(zip.files)
        .filter((p) => !zip.files[p].dir && p !== "manifest.json")
        .map((p) => p.split("/")[0])
        .filter((v, i, a) => a.indexOf(v) === i);

      setImportPreview({
        fileName: file.name,
        sections,
        ts: manifest.exportedAt,
      });

      // Restore localStorage immediately if present (UI-only).
      const lsEntry = zip.file("ui-state/localStorage.json");
      if (lsEntry && typeof window !== "undefined") {
        const data = JSON.parse(await lsEntry.async("string")) as Record<
          string,
          string
        >;
        Object.entries(data).forEach(([k, v]) => {
          window.localStorage.setItem(k, v);
        });
      }

      toast.success(
        `Loaded ${sections.length} section(s) from backup. Backend POST required to apply config/vault.`,
      );
    } catch (e) {
      toast.error(`Import failed: ${(e as Error).message}`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6 p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Backup & Restore
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
            Export the full snapshot of the AI Executive OS — config, vault,
            personas, proposals, and complete logs — into a single ZIP. Restore
            from any previous backup.
          </p>
        </div>
        <Badge variant="outline" className="font-mono text-[10px]">
          format: aios-backup/v1
        </Badge>
      </div>

      {/* Selection grid */}
      <Card className="border-border/60 bg-card/40 p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Archive className="h-4 w-4 text-primary" />
            <h2 className="font-display text-sm font-semibold uppercase tracking-wider">
              Sections to include
            </h2>
          </div>
          <Button variant="ghost" size="sm" onClick={toggleAll}>
            {allSelected ? "Deselect all" : "Select all"}
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const checked = selected.has(s.key);
            return (
              <label
                key={s.key}
                className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
                  checked
                    ? "border-primary/50 bg-primary/5"
                    : "border-border/60 bg-background/40 hover:bg-muted/30"
                }`}
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => toggle(s.key)}
                  className="mt-0.5"
                />
                <Icon
                  className={`mt-0.5 h-4 w-4 shrink-0 ${
                    checked ? "text-primary" : "text-muted-foreground"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{s.label}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {s.description}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      </Card>

      {/* Action row */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Export */}
        <Card className="border-border/60 bg-card/40 p-5">
          <div className="mb-3 flex items-center gap-2">
            <HardDriveDownload className="h-4 w-4 text-primary" />
            <h3 className="font-display text-sm font-semibold uppercase tracking-wider">
              Export Backup
            </h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Generates a ZIP with{" "}
            <span className="font-mono text-foreground">manifest.json</span>{" "}
            plus the selected sections. Logs are exported both as JSON and as
            a flat <span className="font-mono">.log</span> file.
          </p>
          <Button
            onClick={handleExport}
            disabled={exporting || selected.size === 0}
            className="mt-4 w-full"
            size="lg"
          >
            {exporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Building archive…
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Export {selected.size} section{selected.size === 1 ? "" : "s"}
              </>
            )}
          </Button>

          {lastExport && (
            <div className="mt-4 rounded-md border border-border/60 bg-background/60 p-3 text-xs">
              <div className="flex items-center gap-2 text-success">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span className="font-mono">{lastExport.fileName}</span>
              </div>
              <div className="mt-1 grid grid-cols-2 gap-2 text-muted-foreground">
                <div>Size: {lastExport.sizeKb} KB</div>
                <div>Sections: {lastExport.sections.length}</div>
                <div className="col-span-2 truncate">
                  When: {new Date(lastExport.ts).toLocaleString()}
                </div>
              </div>
              {lastExport.errors.length > 0 && (
                <div className="mt-2 flex items-start gap-1.5 text-warning">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <div>
                    {lastExport.errors.length} warning(s):{" "}
                    {lastExport.errors.join("; ")}
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Import */}
        <Card className="border-border/60 bg-card/40 p-5">
          <div className="mb-3 flex items-center gap-2">
            <HardDriveUpload className="h-4 w-4 text-accent" />
            <h3 className="font-display text-sm font-semibold uppercase tracking-wider">
              Import / Restore
            </h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Drop a previously exported{" "}
            <span className="font-mono">.zip</span> backup. UI state restores
            instantly; config & vault require the backend bridge to apply.
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFilePicked(f);
              e.target.value = "";
            }}
          />
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="mt-4 w-full"
            size="lg"
          >
            {importing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Reading archive…
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Choose backup file
              </>
            )}
          </Button>

          {importPreview && (
            <div className="mt-4 rounded-md border border-border/60 bg-background/60 p-3 text-xs">
              <div className="flex items-center gap-2 text-accent">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span className="font-mono">{importPreview.fileName}</span>
              </div>
              <div className="mt-1 text-muted-foreground">
                {importPreview.ts && (
                  <div>
                    Original export:{" "}
                    {new Date(importPreview.ts).toLocaleString()}
                  </div>
                )}
                <div className="mt-1 flex flex-wrap gap-1">
                  {importPreview.sections.map((s) => (
                    <Badge
                      key={s}
                      variant="secondary"
                      className="font-mono text-[10px]"
                    >
                      {s}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>

      <Separator />

      {/* Footer help */}
      <Card className="border-border/60 bg-card/30 p-5">
        <h3 className="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Backend Endpoints (for full source export)
        </h3>
        <ScrollArea className="max-h-40">
          <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-muted-foreground">
{`# add to api_bridge.py
@app.get("/system/source")        # zip of /src/**
@app.post("/system/restore")      # accepts uploaded zip
@app.get("/logs?limit=10000")     # full log dump

# UI hits:  POST http://localhost:8000/system/restore
#           multipart/form-data; field "archive"`}
          </pre>
        </ScrollArea>
      </Card>
    </div>
  );
}
