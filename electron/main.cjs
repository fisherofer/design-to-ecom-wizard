/**
 * OFERTRADINGBOT — Portable Desktop Shell (Electron main process)
 *
 * Goals:
 *  - Run the whole OS on any machine, with no Lovable/cloud dependency.
 *  - Store ALL user data (settings, chats, agents, watchlists, logs) in a
 *    LOCAL SQLite file inside a folder the user picks.
 *  - The data folder is remembered between runs; moving the folder to another
 *    machine (USB stick / Drive) moves the whole user profile with it.
 *
 * Storage engine:
 *  - Primary: node:sqlite (built into modern Node/Electron) -> <dir>/ofer.db
 *  - Fallback: durable JSON file  -> <dir>/ofer-data.json
 *  Both expose the same key/value + append-log API over IPC.
 */

const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");

// ---------------------------------------------------------------- data store

let DB = null; // { kind: 'sqlite'|'json', ... }
let DATA_DIR = null;

function configPath() {
  return path.join(app.getPath("userData"), "portable-config.json");
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), "utf8"));
  } catch {
    return {};
  }
}

function writeConfig(cfg) {
  try {
    fs.mkdirSync(path.dirname(configPath()), { recursive: true });
    fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2), "utf8");
  } catch (err) {
    console.error("[portable] failed writing config:", err);
  }
}

function closeStore() {
  if (DB && DB.kind === "sqlite" && DB.db) {
    try {
      DB.db.close();
    } catch {
      /* already closed */
    }
  }
  DB = null;
}

function openStore(dir) {
  closeStore();
  fs.mkdirSync(dir, { recursive: true });
  DATA_DIR = dir;

  // --- try real SQLite first
  try {
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(path.join(dir, "ofer.db"));
    db.exec(`
      CREATE TABLE IF NOT EXISTS kv (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS event_log (
        id    INTEGER PRIMARY KEY AUTOINCREMENT,
        kind  TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS event_log_kind_idx ON event_log(kind, id DESC);
    `);
    DB = { kind: "sqlite", db, dir };
    return DB;
  } catch (err) {
    console.warn("[portable] node:sqlite unavailable, using JSON store:", err.message);
  }

  // --- fallback JSON store
  const file = path.join(dir, "ofer-data.json");
  let data = { kv: {}, log: [] };
  try {
    data = JSON.parse(fs.readFileSync(file, "utf8"));
    data.kv ||= {};
    data.log ||= [];
  } catch {
    /* fresh store */
  }
  DB = { kind: "json", file, data, dir };
  return DB;
}

function flushJson() {
  if (!DB || DB.kind !== "json") return;
  const tmp = `${DB.file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(DB.data), "utf8");
  fs.renameSync(tmp, DB.file); // atomic-ish: never leaves a half-written file
}

function ensureStore() {
  if (DB) return DB;
  const cfg = readConfig();
  return openStore(cfg.dataDir || path.join(app.getPath("documents"), "OferTradingBot"));
}

// ------------------------------------------------------------------ store ops

function kvGet(key) {
  const s = ensureStore();
  if (s.kind === "sqlite") {
    const row = s.db.prepare("SELECT value FROM kv WHERE key = ?").get(key);
    return row ? row.value : null;
  }
  return Object.prototype.hasOwnProperty.call(s.data.kv, key) ? s.data.kv[key] : null;
}

function kvSet(key, value) {
  const s = ensureStore();
  if (s.kind === "sqlite") {
    s.db
      .prepare(
        "INSERT INTO kv(key, value, updated_at) VALUES(?, ?, ?) " +
          "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
      )
      .run(key, value, Date.now());
    return true;
  }
  s.data.kv[key] = value;
  flushJson();
  return true;
}

function kvDelete(key) {
  const s = ensureStore();
  if (s.kind === "sqlite") {
    s.db.prepare("DELETE FROM kv WHERE key = ?").run(key);
    return true;
  }
  delete s.data.kv[key];
  flushJson();
  return true;
}

function kvAll() {
  const s = ensureStore();
  if (s.kind === "sqlite") {
    const rows = s.db.prepare("SELECT key, value FROM kv").all();
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }
  return { ...s.data.kv };
}

function logAppend(kind, payload) {
  const s = ensureStore();
  const json = typeof payload === "string" ? payload : JSON.stringify(payload);
  if (s.kind === "sqlite") {
    s.db.prepare("INSERT INTO event_log(kind, payload, created_at) VALUES(?, ?, ?)").run(kind, json, Date.now());
    return true;
  }
  s.data.log.push({ kind, payload: json, created_at: Date.now() });
  if (s.data.log.length > 20000) s.data.log = s.data.log.slice(-20000);
  flushJson();
  return true;
}

function logRead(kind, limit = 200) {
  const s = ensureStore();
  if (s.kind === "sqlite") {
    return s.db
      .prepare("SELECT kind, payload, created_at FROM event_log WHERE kind = ? ORDER BY id DESC LIMIT ?")
      .all(kind, limit);
  }
  return s.data.log
    .filter((e) => e.kind === kind)
    .slice(-limit)
    .reverse();
}

function storeInfo() {
  const s = ensureStore();
  const file = s.kind === "sqlite" ? path.join(s.dir, "ofer.db") : s.file;
  let bytes = 0;
  try {
    bytes = fs.statSync(file).size;
  } catch {
    /* not created yet */
  }
  return {
    engine: s.kind,
    dataDir: s.dir,
    file,
    bytes,
    keys: Object.keys(kvAll()).length,
    platform: process.platform,
    appVersion: app.getVersion(),
  };
}

// ------------------------------------------------------------------- IPC wire

function registerIpc() {
  ipcMain.handle("portable:info", () => storeInfo());
  ipcMain.handle("portable:get", (_e, key) => kvGet(key));
  ipcMain.handle("portable:set", (_e, key, value) => kvSet(key, value));
  ipcMain.handle("portable:delete", (_e, key) => kvDelete(key));
  ipcMain.handle("portable:all", () => kvAll());
  ipcMain.handle("portable:logAppend", (_e, kind, payload) => logAppend(kind, payload));
  ipcMain.handle("portable:logRead", (_e, kind, limit) => logRead(kind, limit));

  ipcMain.handle("portable:chooseDataDir", async () => {
    const res = await dialog.showOpenDialog({
      title: "Choose a folder for your OferTradingBot data",
      properties: ["openDirectory", "createDirectory"],
    });
    if (res.canceled || !res.filePaths[0]) return storeInfo();
    const dir = res.filePaths[0];
    openStore(dir);
    writeConfig({ ...readConfig(), dataDir: dir });
    return storeInfo();
  });

  ipcMain.handle("portable:migrate", (_e, entries) => {
    // entries: Record<string, string> coming from browser localStorage
    for (const [key, value] of Object.entries(entries || {})) kvSet(key, value);
    return storeInfo();
  });

  ipcMain.handle("portable:revealDataDir", () => {
    const s = ensureStore();
    shell.openPath(s.dir);
    return true;
  });
}

// --------------------------------------------------------------- app lifecycle

function resolveAppEntry() {
  // 1) explicit override (e.g. a locally running server)
  if (process.env.PORTABLE_APP_URL) return { url: process.env.PORTABLE_APP_URL };
  // 2) bundled static client build
  for (const candidate of [
    path.join(__dirname, "..", "dist", "client", "index.html"),
    path.join(__dirname, "..", "dist", "index.html"),
  ]) {
    if (fs.existsSync(candidate)) return { file: candidate };
  }
  // 3) dev server
  return { url: "http://127.0.0.1:8080" };
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    backgroundColor: "#0b0f17",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const entry = resolveAppEntry();
  if (entry.file) win.loadFile(entry.file);
  else win.loadURL(entry.url);
}

app.whenReady().then(() => {
  ensureStore();
  registerIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  closeStore();
  if (process.platform !== "darwin") app.quit();
});
