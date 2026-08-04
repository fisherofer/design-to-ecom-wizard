# PORTABLE.md — Running OFERTRADINGBOT outside Lovable

The whole OS runs offline on any Windows / macOS / Linux machine. Nothing is
required from Lovable or from the cloud.

## Layout

```
<project>/
  electron/main.cjs      desktop shell + local SQLite store
  electron/preload.cjs    IPC bridge (window.oferDesktop)
  src/                    frontend
  src/assets/backend/     Python trading engine (FastAPI)
  src/assets/hub/         Python routers + venv_manager
```

## 1. Frontend / desktop app

```bash
bun install
bun run build             # static client build
bun run desktop           # run the Electron shell
bun run desktop:build     # package a distributable
```

`electron/main.cjs` picks its entry in this order:

1. `PORTABLE_APP_URL` env var (point it at any locally running server)
2. bundled `dist/client/index.html`
3. `http://127.0.0.1:8080` (dev server)

## 2. Python engine

```bash
python system_orchestrator.py
```

Computes ROOT dynamically from `__file__`, creates `.venv`, installs
`requirements.txt`, and launches FastAPI on `API_PORT` (default 8000). Fully
idempotent — safe to re-run.

## 3. Where user data lives

On first launch the app asks for a data folder (default:
`Documents/OferTradingBot`). Everything the user produces is written there:

| File | Contents |
| --- | --- |
| `ofer.db` | SQLite: `kv` (settings, agents, watchlists, chats) + `event_log` (runs, trades) |
| `ofer-data.json` | Fallback store when `node:sqlite` is unavailable |

The folder is self-contained: copy it to a USB stick or another machine and
the full profile moves with it. The chosen path is remembered in the OS user
data directory (`portable-config.json`).

**Local only.** No cloud sync. Nothing is written to Supabase in desktop mode.

## 4. Moving between machines

- Settings → Portable Data → **Export profile** produces one JSON.
- On the new machine: **Import profile**.
- Or simply copy the whole data folder and point the app at it.

## 5. Coming from the browser build

Settings → Portable Data → **Import browser data** copies every existing
`localStorage` key into the local database in one click.
