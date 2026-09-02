/**
 * bootstrapperExport — generates the OFERTRADINGBOT VENV bootstrapper
 * (`system_orchestrator.py`) and the Master Integration JSON. Both files
 * are produced dynamically on the client so the user can download the
 * complete "OS-independent" boot package alongside the source bundle.
 *
 * Ground rules baked in:
 *  - Root path resolved dynamically from __file__ (no D:\ / G:\ hardcoding).
 *  - Idempotent .env / requirements.txt / backend stub creation.
 *  - Isolated Python VENV, works on Windows and POSIX.
 *  - No cloud dependency: FastAPI on 127.0.0.1:<API_PORT>.
 */

// Real Python modules — sourced from OFERTRADINGBOT specs and the
// 2026-07-24 workspace backup. Bundled verbatim as raw text so the user
// can drop them into their local repo and mount the routers on FastAPI.
import venvManagerPy from "@/assets/hub/venv_manager.py?raw";
import venvRoutesPy from "@/assets/hub/venv_routes.py?raw";
import hubInitPy from "@/assets/hub/__init__.py?raw";
import keysManagerPy from "@/assets/hub/keys_manager.py?raw";
import systemRoutesPy from "@/assets/hub/system_routes.py?raw";
import omsRoutesPy from "@/assets/hub/oms_routes.py?raw";
import riskRoutesPy from "@/assets/hub/risk_routes.py?raw";
import marketStreamRoutesPy from "@/assets/hub/market_stream_routes.py?raw";
import backtestRoutesPy from "@/assets/hub/backtest_routes.py?raw";
import mcpRoutesPy from "@/assets/hub/mcp_routes.py?raw";
import tradingAccountRoutesPy from "@/assets/hub/trading_account_routes.py?raw";
import alertsRoutesPy from "@/assets/hub/alerts_routes.py?raw";
import quotesRouterPy from "@/assets/hub/quotes_router.py?raw";
import alpacaRoutesPy from "@/assets/hub/alpaca_routes.py?raw";
import ownershipRoutesPy from "@/assets/hub/ownership_routes.py?raw";
import quantRoutesPy from "@/assets/hub/quant_routes.py?raw";
import hiveRoutesPy from "@/assets/hub/hive_routes.py?raw";
import microstructureRoutesPy from "@/assets/hub/microstructure_routes.py?raw";
import quantPredictionEnginePy from "@/assets/backend/quant_prediction_engine.py?raw";
import universeScannerPy from "@/assets/backend/universe_scanner.py?raw";
import localDataUpdaterPy from "@/assets/backend/local_data_updater.py?raw";
import configPy from "@/assets/backend/config.py?raw";
import requirementsTxt from "@/assets/backend/requirements.txt?raw";
import backendMainPy from "@/assets/backend/main.py?raw";
import orchestratorPyFull from "@/assets/backend/system_orchestrator.py?raw";
// Core engine modules extracted from the 2026-07-25 workspace backup.
import backtestingEnginePy from "@/assets/backend/backtesting_engine.py?raw";
import hardRiskManagerPy from "@/assets/backend/hard_risk_manager.py?raw";
import agentAlphaHunterPy from "@/assets/backend/agent_alpha_hunter.py?raw";
import agentWhaleTrackerPy from "@/assets/backend/agent_whale_tracker.py?raw";
import agentMetaSupervisorPy from "@/assets/backend/agent_meta_supervisor.py?raw";
import marketDataStreamPy from "@/assets/backend/market_data_stream.py?raw";
import orderManagementSystemPy from "@/assets/backend/order_management_system.py?raw";
import liveTelemetryWsPy from "@/assets/backend/live_telemetry_ws.py?raw";
import llmCognitiveEnginePy from "@/assets/backend/llm_cognitive_engine.py?raw";
import timeseriesDbPy from "@/assets/backend/timeseries_db.py?raw";
import masterOrchestratorPy from "@/assets/backend/master_orchestrator.py?raw";
import tradingCostModelPy from "@/assets/backend/trading_cost_model.py?raw";
import portfolioRiskManagerPy from "@/assets/backend/portfolio_risk_manager.py?raw";
import exitStrategyOptimizerPy from "@/assets/backend/exit_strategy_optimizer.py?raw";
import sentimentAnalysisEnginePy from "@/assets/backend/sentiment_analysis_engine.py?raw";
import notificationDispatcherPy from "@/assets/backend/notification_dispatcher.py?raw";
import mockDataGuardEnginePy from "@/assets/backend/mock_data_guard_engine.py?raw";
import smartLlmExecutionEnginePy from "@/assets/backend/smart_llm_execution_engine.py?raw";
import executionSlicerPy from "@/assets/backend/execution_slicer.py?raw";
import optionsSentimentPy from "@/assets/backend/options_sentiment.py?raw";
import localSqlVaultPy from "@/assets/hub/local_sql_vault.py?raw";

export interface BootstrapperFiles {
  masterJson: string;
  orchestratorPy: string;
  readmeMd: string;
  venvManagerPy: string;
  venvRoutesPy: string;
  backendFiles: Record<string, string>;
}

export function buildMasterIntegrationJson(): string {
  const payload = {
    system_directive: "OFER FISHER MANDATORY PROTOCOL - LEVEL 9 ARCHITECTURE",
    project: "OFERTRADINGBOT",
    generated_at: new Date().toISOString(),
    core_rules: {
      absolute_truth: true,
      zero_brevity: true,
      idempotency: true,
      no_hardcoding: true,
      security_first: true,
    },
    architecture_requirements: {
      execution_environment: "Strictly Isolated Python VENV",
      os_independence:
        "The system must run independently of the host OS. All dependencies (Python, Node/NPM for React build) must be orchestrated via a central Python Bootstrapper within the VENV.",
      drive_separation: {
        drive_d:
          "Execution, VENV, Node Modules, Heavy Codebase (Local processing only)",
        drive_g:
          "Cloud-Synced Backups, Telemetry, State JSONs, Markdown Reports (No execution)",
      },
      root_resolution:
        "ROOT = Path(__file__).resolve().parent — never hardcode drive letters.",
    },
    ai_responsibilities: {
      lovable_imports: {
        task: "Extract UI components (React, Vite, Tailwind) and serve them statically via FastAPI or bundle into the local execution drive.",
        constraints:
          "No cloud-hosted APIs at runtime. All fetch() calls must point to http://127.0.0.1:<DYNAMIC_PORT>/api.",
      },
      claude_imports: {
        task: "Refactor the backend into the Orchestrator. Build FastAPI gateway, Ollama/Gemini fallback, and VENV management.",
        constraints:
          "try/except around every external call. Secrets only via .env. exist_ok=True on every mkdir.",
      },
    },
    required_output:
      "Python Bootstrapper (system_orchestrator.py) that creates the VENV, installs requirements, and launches the FastAPI backend + Lovable React frontend dynamically.",
  };
  return JSON.stringify(payload, null, 2);
}

export function buildOrchestratorPy(): string {
  return `# PATH: <ROOT>/system_orchestrator.py
# Generated by AI Executive OS — OFERTRADINGBOT Bootstrapper
# Root is resolved dynamically from __file__. No hardcoded drive letters.

import os
import sys
import subprocess
import venv
from pathlib import Path

try:
    from dotenv import load_dotenv  # type: ignore
except ImportError:
    load_dotenv = None  # bootstrapped later inside the VENV


def initialize_environment() -> Path:
    """Locate the project root and ensure a .env template exists."""
    root_dir = Path(__file__).resolve().parent
    env_path = root_dir / ".env"

    if not env_path.exists():
        with open(env_path, "w", encoding="utf-8") as f:
            f.write(
                "GEMINI_API_KEY=\\n"
                "OPENAI_API_KEY=\\n"
                "ANTHROPIC_API_KEY=\\n"
                "GROQ_API_KEY=\\n"
                "ALPACA_KEY_ID=\\n"
                "ALPACA_SECRET_KEY=\\n"
                "API_PORT=8050\\n"
            )
        print(f"[SYSTEM] Created template .env at {env_path}. Populate keys before live use.")

    if load_dotenv is not None:
        load_dotenv(dotenv_path=env_path)

    return root_dir


def setup_isolated_venv(root_dir: Path) -> Path:
    """Create an isolated .venv (idempotent) and return its python executable."""
    venv_dir = root_dir / ".venv"

    if not venv_dir.exists():
        print(f"[VENV] Creating isolated virtual environment at {venv_dir} ...")
        try:
            venv.create(venv_dir, with_pip=True)
            print("[VENV] Virtual environment created successfully.")
        except Exception as e:
            print(f"[ERROR] Failed to create VENV: {e}")
            sys.exit(1)
    else:
        print(f"[VENV] Virtual environment already exists at {venv_dir}.")

    if os.name == "nt":
        python_executable = venv_dir / "Scripts" / "python.exe"
    else:
        python_executable = venv_dir / "bin" / "python"

    if not python_executable.exists():
        print(f"[ERROR] Python executable not found in VENV at {python_executable}")
        sys.exit(1)

    return python_executable


def verify_and_install_requirements(python_exec: Path, root_dir: Path) -> None:
    """Ensure requirements.txt exists and all deps are installed in the VENV."""
    req_file = root_dir / "requirements.txt"
    if not req_file.exists():
        with open(req_file, "w", encoding="utf-8") as f:
            f.write(
                "fastapi\\n"
                "uvicorn[standard]\\n"
                "python-dotenv\\n"
                "requests\\n"
                "pydantic\\n"
                "httpx\\n"
            )
        print("[SYSTEM] Created default requirements.txt.")

    print("[VENV] Verifying dependencies ...")
    try:
        subprocess.check_call(
            [str(python_exec), "-m", "pip", "install", "--upgrade", "pip"],
            stdout=sys.stdout,
            stderr=sys.stderr,
        )
        subprocess.check_call(
            [str(python_exec), "-m", "pip", "install", "-r", str(req_file)],
            stdout=sys.stdout,
            stderr=sys.stderr,
        )
    except subprocess.CalledProcessError as e:
        print(f"[ERROR] Dependency installation failed: {e}")
        sys.exit(1)


def ensure_backend_stub(root_dir: Path) -> Path:
    """Create a minimal FastAPI backend stub if none exists (idempotent)."""
    api_server_path = root_dir / "backend" / "main.py"
    api_server_path.parent.mkdir(parents=True, exist_ok=True)

    if not api_server_path.exists():
        with open(api_server_path, "w", encoding="utf-8") as f:
            f.write(
                'import os\\n'
                'import uvicorn\\n'
                'from fastapi import FastAPI\\n'
                'from fastapi.middleware.cors import CORSMiddleware\\n\\n'
                'app = FastAPI(title="OFERTRADINGBOT Backend")\\n'
                'app.add_middleware(\\n'
                '    CORSMiddleware,\\n'
                '    allow_origins=["*"],\\n'
                '    allow_methods=["*"],\\n'
                '    allow_headers=["*"],\\n'
                ')\\n\\n'
                '@app.get("/api/health")\\n'
                'def health_check():\\n'
                '    return {"status": "ACTIVE", "venv": "ISOLATED"}\\n\\n'
                'if __name__ == "__main__":\\n'
                '    port = int(os.environ.get("API_PORT", 8050))\\n'
                '    uvicorn.run(app, host="127.0.0.1", port=port)\\n'
            )
        print(f"[SYSTEM] Created backend stub at {api_server_path}.")
    return api_server_path


def launch_system(python_exec: Path, api_server_path: Path) -> None:
    """Launch the FastAPI backend under the isolated VENV."""
    print("[SYSTEM] Launching OFERTRADINGBOT Orchestrator ...")
    try:
        subprocess.Popen([str(python_exec), str(api_server_path)])
        print("[SYSTEM] Backend running on http://127.0.0.1:$API_PORT (default 8050).")
    except Exception as e:
        print(f"[ERROR] Failed to launch system: {e}")


def main() -> None:
    print("=== OFERTRADINGBOT OS-INDEPENDENT BOOTSTRAPPER ===")
    root_dir = initialize_environment()
    python_exec = setup_isolated_venv(root_dir)
    verify_and_install_requirements(python_exec, root_dir)
    api_server_path = ensure_backend_stub(root_dir)
    launch_system(python_exec, api_server_path)


if __name__ == "__main__":
    main()
`;
}

export function buildBootstrapReadme(): string {
  return `# OFERTRADINGBOT — OS-Independent Bootstrapper

This package contains everything needed to spin up the local backend
without depending on the host operating system's global Python or
Node installation.

## Files
- \`system_orchestrator.py\` — creates an isolated \`.venv\`,
  installs \`requirements.txt\`, and launches the FastAPI backend
  on \`127.0.0.1:$API_PORT\` (default 8050).
- \`ofer_master_integration.json\` — the master directive JSON
  used to brief Claude / Lovable / Gemini on the architecture.

## Usage
\`\`\`bash
# 1. Drop both files into your project root (any drive).
# 2. Run once with the system Python:
python system_orchestrator.py
# 3. Populate the generated .env with your API keys.
# 4. Re-run to launch the backend inside the isolated VENV.
\`\`\`

## Guarantees
- ROOT is derived dynamically from \`__file__\` — no hardcoded
  drive letters (\`D:\\\\\`, \`G:\\\\\`) anywhere.
- All directory creations use \`exist_ok=True\` (idempotent).
- All external calls in the generated backend stub use CORS and
  bind to \`127.0.0.1\` only.
`;
}

export function buildBootstrapperBundle(): BootstrapperFiles {
  return {
    masterJson: buildMasterIntegrationJson(),
    orchestratorPy: orchestratorPyFull || buildOrchestratorPy(),
    readmeMd: buildBootstrapReadme(),
    venvManagerPy,
    venvRoutesPy,
    backendFiles: {
      "hub/__init__.py": hubInitPy,
      "hub/venv_manager.py": venvManagerPy,
      "hub/venv_routes.py": venvRoutesPy,
      "hub/keys_manager.py": keysManagerPy,
      "hub/system_routes.py": systemRoutesPy,
      "hub/oms_routes.py": omsRoutesPy,
      "hub/risk_routes.py": riskRoutesPy,
      "hub/market_stream_routes.py": marketStreamRoutesPy,
      "hub/backtest_routes.py": backtestRoutesPy,
      "hub/mcp_routes.py": mcpRoutesPy,
      "hub/trading_account_routes.py": tradingAccountRoutesPy,
      "hub/alerts_routes.py": alertsRoutesPy,
      "hub/quotes_router.py": quotesRouterPy,
      "hub/alpaca_routes.py": alpacaRoutesPy,
      "hub/ownership_routes.py": ownershipRoutesPy,
      "hub/quant_routes.py": quantRoutesPy,
      "hub/hive_routes.py": hiveRoutesPy,
      "hub/microstructure_routes.py": microstructureRoutesPy,
      "config.py": configPy,
      "requirements.txt": requirementsTxt,
      "backend/main.py": backendMainPy,
      "system_orchestrator.py": orchestratorPyFull,
      // Core engine modules — Sprint B integrations from 2026-07-25 backup.
      "engines/backtesting_engine.py": backtestingEnginePy,
      "engines/hard_risk_manager.py": hardRiskManagerPy,
      "engines/market_data_stream.py": marketDataStreamPy,
      "engines/order_management_system.py": orderManagementSystemPy,
      "engines/live_telemetry_ws.py": liveTelemetryWsPy,
      "engines/llm_cognitive_engine.py": llmCognitiveEnginePy,
      "engines/timeseries_db.py": timeseriesDbPy,
      "agents/agent_alpha_hunter.py": agentAlphaHunterPy,
      "agents/agent_whale_tracker.py": agentWhaleTrackerPy,
      "agents/agent_meta_supervisor.py": agentMetaSupervisorPy,
      "engines/quant_prediction_engine.py": quantPredictionEnginePy,
      "engines/universe_scanner.py": universeScannerPy,
      "engines/local_data_updater.py": localDataUpdaterPy,
      "master_orchestrator.py": masterOrchestratorPy,
      // Sprint C — cost/tax model, Kelly sizing, dynamic exits, sentiment, alerts.
      "engines/trading_cost_model.py": tradingCostModelPy,
      "engines/portfolio_risk_manager.py": portfolioRiskManagerPy,
      "engines/exit_strategy_optimizer.py": exitStrategyOptimizerPy,
      "engines/sentiment_analysis_engine.py": sentimentAnalysisEnginePy,
      "engines/notification_dispatcher.py": notificationDispatcherPy,
      // Sprint D — simulated-data guard + dual-loop AI execution engine.
      "core/mock_data_guard_engine.py": mockDataGuardEnginePy,
      "core/smart_llm_execution_engine.py": smartLlmExecutionEnginePy,
      // Sprint E — institutional execution slicing, options greeks/sentiment, local SQL vault.
      "engines/execution_slicer.py": executionSlicerPy,
      "engines/options_sentiment.py": optionsSentimentPy,
      "hub/local_sql_vault.py": localSqlVaultPy,
    },
  };
}

export function buildBackendPackageJson(): string {
  const bundle = buildBootstrapperBundle();
  return JSON.stringify(
    {
      success: true,
      timestamp: new Date().toISOString(),
      project: "OFERTRADINGBOT",
      kind: "backend-package",
      fileCount: Object.keys(bundle.backendFiles).length,
      files: bundle.backendFiles,
    },
    null,
    2,
  );
}

export function downloadTextFile(
  fileName: string,
  content: string,
  mime = "text/plain",
): number {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return blob.size;
}
