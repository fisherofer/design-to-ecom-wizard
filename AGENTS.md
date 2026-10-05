
- Hive multi-station sync: each station keeps a full local SQL copy; kv writes go to sync_changes (HLC, last-writer-wins, tombstones) via hub/station_sync.py; temp scope and secrets never sync. Why: every station runs on its own without depending on a single location.

- One-click start: src/assets/start.py (+ START.bat / start.sh / start.command) heals the venv beside it and runs the local server on 127.0.0.1:8050 (the UI default hub port); hub/__init__.py stays import-free so the plain host Python can bootstrap. Why: portable launch from any folder or machine.

- Headless hive relay: stations POST their change log to /api/public/hive/relay (Bearer HIVE_RELAY_TOKEN), which stores it in Drive <folder>/stations and returns peers' logs; config + passphrase live in user-scope kv keys prefixed hive.relay (never synced). Why: stations sync without a browser open.
