import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';

const dbPath = path.join(os.homedir(), 'Library/Application Support/localbench', 'localbench.db');
console.log('Opening database at:', dbPath);

try {
  const db = new Database(dbPath, { readonly: true });
  const rows = db.prepare('SELECT * FROM models_cache').all();
  console.log('Cached models:', JSON.stringify(rows, null, 2));
} catch (e) {
  console.error('Error reading database:', e);
}
