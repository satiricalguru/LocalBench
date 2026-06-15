import { ipcMain } from 'electron';
import { runBenchmarkSuite, cancelBenchmarkRun, BenchmarkConfig, BenchmarkTask, BUILT_IN_TASKS } from '../utils/benchmark-runner';
import { insertRun } from '../utils/db';
import crypto from 'crypto';

export function registerBenchmarkIPCHandlers() {
  // Start benchmark run
  ipcMain.handle(
    'start-benchmark',
    async (
      event,
      { config, customTasks }: { config: BenchmarkConfig; customTasks?: BenchmarkTask[] }
    ): Promise<string> => {
      const runId = crypto.randomUUID();

      // Write initial run entry to SQLite database
      insertRun({
        id: runId,
        startedAt: Date.now(),
        tasks: config.tasks,
        models: config.models.map(m => m.id),
        settings: JSON.stringify({
          concurrency: config.concurrency,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
          timeoutMs: config.timeoutMs
        })
      });

      // Launch suite run in background asynchronously
      runBenchmarkSuite(
        runId,
        config,
        customTasks ?? [],
        (progressEvent) => {
          // Send progress updates to the renderer process
          if (!event.sender.isDestroyed()) {
            event.sender.send('benchmark-progress', progressEvent);
          }
        }
      ).catch((err) => {
        console.error(`Error in benchmark execution for run ${runId}:`, err);
        if (!event.sender.isDestroyed()) {
          event.sender.send('benchmark-progress', {
            type: 'error',
            payload: { runId, error: err?.message ?? 'Unknown benchmark error' }
          });
        }
      });

      return runId;
    }
  );

  // Cancel running benchmark
  ipcMain.handle('cancel-benchmark', async (_event, runId: string): Promise<void> => {
    cancelBenchmarkRun(runId);
  });

  // Query built-in benchmark tasks
  ipcMain.handle('get-built-in-tasks', async (): Promise<BenchmarkTask[]> => {
    return BUILT_IN_TASKS;
  });
}
