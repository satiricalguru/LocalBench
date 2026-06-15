import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';

let db: Database.Database | null = null;

export function initDB(): Database.Database {
  if (db) return db;

  const userDataPath = app.getPath('userData');
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }

  const dbPath = path.join(userDataPath, 'localbench.db');
  db = new Database(dbPath);

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id          TEXT PRIMARY KEY,
      started_at  INTEGER NOT NULL,
      finished_at INTEGER,
      tasks       TEXT NOT NULL,      -- JSON array of task IDs
      models      TEXT NOT NULL,      -- JSON array of model IDs
      settings    TEXT                -- JSON of settings used (weights, concurrency, etc)
    );

    CREATE TABLE IF NOT EXISTS task_results (
      id               TEXT PRIMARY KEY,
      run_id           TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      task_id          TEXT NOT NULL,
      model_id         TEXT NOT NULL,
      provider         TEXT NOT NULL,
      score            REAL,
      ttft_ms          REAL,
      tps              REAL,
      total_latency_ms REAL,
      prompt_tokens    INTEGER,
      completion_tokens INTEGER,
      raw_response     TEXT,
      error            TEXT,
      created_at       INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS models_cache (
      id           TEXT PRIMARY KEY,  -- provider:modelId
      provider     TEXT NOT NULL,
      model_id     TEXT NOT NULL,
      display_name TEXT,
      size_b       REAL,
      quantization TEXT,
      family       TEXT,
      context_len  INTEGER,
      size_on_disk INTEGER,
      last_seen    INTEGER NOT NULL
    );
  `);

  return db;
}

export function getDB(): Database.Database {
  if (!db) {
    return initDB();
  }
  return db;
}

// Database helper functions
export function insertRun(run: {
  id: string;
  startedAt: number;
  tasks: string[];
  models: string[];
  settings: string;
}) {
  const database = getDB();
  const stmt = database.prepare(`
    INSERT INTO runs (id, started_at, tasks, models, settings)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(run.id, run.startedAt, JSON.stringify(run.tasks), JSON.stringify(run.models), run.settings);
}

export function updateRunFinished(runId: string, finishedAt: number) {
  const database = getDB();
  const stmt = database.prepare(`
    UPDATE runs SET finished_at = ? WHERE id = ?
  `);
  stmt.run(finishedAt, runId);
}

export function insertTaskResult(result: {
  id: string;
  runId: string;
  taskId: string;
  modelId: string;
  provider: string;
  score: number | null;
  ttftMs: number | null;
  tps: number | null;
  totalLatencyMs: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  rawResponse: string | null;
  error: string | null;
  createdAt: number;
}) {
  const database = getDB();
  const stmt = database.prepare(`
    INSERT INTO task_results (
      id, run_id, task_id, model_id, provider, score, ttft_ms, tps, 
      total_latency_ms, prompt_tokens, completion_tokens, raw_response, error, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    result.id,
    result.runId,
    result.taskId,
    result.modelId,
    result.provider,
    result.score,
    result.ttftMs,
    result.tps,
    result.totalLatencyMs,
    result.promptTokens,
    result.completionTokens,
    result.rawResponse,
    result.error,
    result.createdAt
  );
}

export function getRunHistory(limit?: number): any[] {
  const database = getDB();
  const sql = `
    SELECT r.id, r.started_at as startedAt, r.finished_at as finishedAt, r.tasks, r.models, r.settings,
           (SELECT AVG(tr.score) FROM task_results tr WHERE tr.run_id = r.id AND tr.error IS NULL) as avgScore
    FROM runs r
    ORDER BY r.started_at DESC
    ${limit ? 'LIMIT ?' : ''}
  `;
  const stmt = limit ? database.prepare(sql).bind(limit) : database.prepare(sql);
  const rows = stmt.all() as any[];

  return rows.map(row => ({
    ...row,
    tasks: JSON.parse(row.tasks),
    models: JSON.parse(row.models),
    settings: row.settings ? JSON.parse(row.settings) : null,
  }));
}

export function getRunDetails(runId: string): any {
  const database = getDB();
  const runStmt = database.prepare(`
    SELECT id, started_at as startedAt, finished_at as finishedAt, tasks, models, settings
    FROM runs WHERE id = ?
  `);
  const run = runStmt.get(runId) as any;
  if (!run) return null;

  const resultsStmt = database.prepare(`
    SELECT id, task_id as taskId, model_id as modelId, provider, score, 
           ttft_ms as ttft, ttft_ms as ttftMs, 
           tps, 
           total_latency_ms as totalLatency, total_latency_ms as totalLatencyMs, 
           prompt_tokens as promptTokens,
           completion_tokens as completionTokens, raw_response as rawResponse, 
           error, created_at as timestamp, created_at as createdAt
    FROM task_results WHERE run_id = ?
  `);
  const results = resultsStmt.all(runId) as any[];

  return {
    id: run.id,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    tasks: JSON.parse(run.tasks),
    models: JSON.parse(run.models),
    settings: run.settings ? JSON.parse(run.settings) : null,
    results
  };
}

export function deleteRun(runId: string) {
  const database = getDB();
  const stmt = database.prepare('DELETE FROM runs WHERE id = ?');
  stmt.run(runId);
}

export function clearAllHistory() {
  const database = getDB();
  database.exec('DELETE FROM runs');
}

export function cacheModels(models: Array<{
  id: string;
  provider: string;
  model_id: string;
  display_name?: string;
  size_b?: number;
  quantization?: string;
  family?: string;
  context_len?: number;
  size_on_disk?: number;
  last_seen: number;
}>) {
  const database = getDB();
  const insertStmt = database.prepare(`
    INSERT OR REPLACE INTO models_cache (
      id, provider, model_id, display_name, size_b, quantization, family, context_len, size_on_disk, last_seen
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const transaction = database.transaction((items) => {
    for (const item of items) {
      insertStmt.run(
        item.id,
        item.provider,
        item.model_id,
        item.display_name || null,
        item.size_b || null,
        item.quantization || null,
        item.family || null,
        item.context_len || null,
        item.size_on_disk || null,
        item.last_seen
      );
    }
  });

  transaction(models);
}

export function getCachedModels(providerName?: string): any[] {
  const database = getDB();
  let stmt;
  if (providerName) {
    stmt = database.prepare(`
      SELECT id, provider, model_id as modelId, display_name as displayName, size_b as sizeB,
             quantization, family, context_len as contextLen, size_on_disk as sizeOnDisk, last_seen as lastSeen
      FROM models_cache WHERE provider = ?
    `);
    return stmt.all(providerName) as any[];
  } else {
    stmt = database.prepare(`
      SELECT id, provider, model_id as modelId, display_name as displayName, size_b as sizeB,
             quantization, family, context_len as contextLen, size_on_disk as sizeOnDisk, last_seen as lastSeen
      FROM models_cache
    `);
    return stmt.all() as any[];
  }
}

export function pruneCachedModels(provider: string, activeModelIds: string[]) {
  const database = getDB();
  if (activeModelIds.length === 0) {
    const stmt = database.prepare('DELETE FROM models_cache WHERE provider = ?');
    stmt.run(provider);
  } else {
    const placeholders = activeModelIds.map(() => '?').join(',');
    const stmt = database.prepare(`
      DELETE FROM models_cache 
      WHERE provider = ? AND model_id NOT IN (${placeholders})
    `);
    stmt.run(provider, ...activeModelIds);
  }
}

export function deleteCachedModel(provider: string, modelId: string) {
  const database = getDB();
  const stmt = database.prepare('DELETE FROM models_cache WHERE provider = ? AND model_id = ?');
  stmt.run(provider, modelId);
}

