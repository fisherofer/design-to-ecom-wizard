
- Hive multi-station sync: each station keeps a full local SQL copy; kv writes go to sync_changes (HLC, last-writer-wins, tombstones) via hub/station_sync.py; temp scope and secrets never sync. Why: every station runs on its own without depending on a single location.
