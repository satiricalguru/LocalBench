import { ipcMain, dialog, app, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import { getRunHistory, getRunDetails, deleteRun, clearAllHistory } from '../utils/db';

export function registerHistoryIPCHandlers() {
  // Query list of all runs
  ipcMain.handle('get-run-history', async (_event, limit?: number) => {
    return getRunHistory(limit);
  });

  // Query details of a specific run
  ipcMain.handle('get-run-details', async (_event, runId: string) => {
    return getRunDetails(runId);
  });

  // Delete a specific run
  ipcMain.handle('delete-run', async (_event, runId: string) => {
    deleteRun(runId);
  });

  // Reset database history
  ipcMain.handle('clear-all-history', async () => {
    clearAllHistory();
  });

  // Query database file path
  ipcMain.handle('get-database-path', async () => {
    return path.join(app.getPath('userData'), 'localbench.db');
  });

  // Export specific run to JSON or CSV
  ipcMain.handle('export-run', async (event, runId: string, format: 'json' | 'csv'): Promise<string | null> => {
    const details = getRunDetails(runId);
    if (!details) throw new Error("Run not found");

    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return null;

    const ext = format === 'json' ? 'json' : 'csv';
    const defaultFilename = `localbench-run-${runId}-${new Date(details.startedAt).toISOString().split('T')[0]}.${ext}`;

    const saveResult = await dialog.showSaveDialog(window, {
      title: 'Export Benchmark Run',
      defaultPath: defaultFilename,
      filters: [
        { name: format === 'json' ? 'JSON File' : 'CSV File', extensions: [ext] }
      ]
    });

    if (saveResult.canceled || !saveResult.filePath) {
      return null;
    }

    const targetPath = saveResult.filePath;

    if (format === 'json') {
      fs.writeFileSync(targetPath, JSON.stringify(details, null, 2));
    } else {
      // CSV format
      const headers = [
        'Model ID',
        'Provider',
        'Task ID',
        'Quality Score (0-1)',
        'TPS',
        'TTFT (ms)',
        'Total Latency (ms)',
        'Prompt Tokens',
        'Completion Tokens',
        'Error',
        'Timestamp'
      ];
      
      let csvContent = headers.join(',') + '\n';
      
      for (const res of details.results) {
        const row = [
          `"${res.modelId}"`,
          `"${res.provider}"`,
          `"${res.taskId}"`,
          res.score !== null ? res.score : '',
          res.tps !== null ? res.tps : '',
          res.ttftMs !== null ? res.ttftMs : '',
          res.totalLatencyMs !== null ? res.totalLatencyMs : '',
          res.promptTokens !== null ? res.promptTokens : '',
          res.completionTokens !== null ? res.completionTokens : '',
          res.error ? `"${res.error}"` : '""',
          res.createdAt
        ];
        csvContent += row.join(',') + '\n';
      }

      fs.writeFileSync(targetPath, csvContent);
    }

    return targetPath;
  });

  // Backup database file
  ipcMain.handle('backup-database', async (event): Promise<string | null> => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return null;

    const saveResult = await dialog.showSaveDialog(window, {
      title: 'Backup Database File',
      defaultPath: 'localbench_backup.db',
      filters: [
        { name: 'SQLite Database', extensions: ['db'] }
      ]
    });

    if (saveResult.canceled || !saveResult.filePath) {
      return null;
    }

    try {
      const dbPath = path.join(app.getPath('userData'), 'localbench.db');
      fs.copyFileSync(dbPath, saveResult.filePath);
      return saveResult.filePath;
    } catch (err) {
      console.error("Database backup failed:", err);
      throw err;
    }
  });
}
