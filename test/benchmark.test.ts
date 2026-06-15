import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import path from 'path';
import fs from 'fs';

// Mock db.ts to run database-free in-memory tests under standard Node
const { dbMock } = vi.hoisted(() => {
  const runs: any[] = [];
  const taskResults: any[] = [];
  return {
    dbMock: {
      runs,
      taskResults,
      initDB: vi.fn(),
      getDB: vi.fn(),
      insertRun: vi.fn((run) => {
        runs.push({
          ...run,
          avgScore: null
        });
      }),
      updateRunFinished: vi.fn((runId, finishedAt) => {
        const run = runs.find(r => r.id === runId);
        if (run) {
          run.finishedAt = finishedAt;
          // compute mock avgScore
          const runResults = taskResults.filter(r => r.runId === runId && r.error === null);
          if (runResults.length > 0) {
            run.avgScore = runResults.reduce((acc, curr) => acc + (curr.score ?? 0), 0) / runResults.length;
          }
        }
      }),
      insertTaskResult: vi.fn((result) => {
        taskResults.push(result);
      }),
      getRunHistory: vi.fn(() => runs),
      getRunDetails: vi.fn((runId) => {
        const run = runs.find(r => r.id === runId);
        if (!run) return null;
        return {
          ...run,
          results: taskResults.filter(r => r.runId === runId).map(r => ({
            ...r,
            ttft: r.ttftMs,
            totalLatency: r.totalLatencyMs,
            timestamp: r.createdAt
          }))
        };
      })
    }
  };
});

vi.mock('../electron/utils/db', () => dbMock);

// Mock electron app path before loading benchmark-runner
vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'userData') return path.join(__dirname, 'test-db-dir');
      if (name === 'logs') return path.join(__dirname, 'test-logs-dir');
      return __dirname;
    }
  }
}));

import { runBenchmarkSuite, BenchmarkConfig } from '../electron/utils/benchmark-runner';
import { initDB, insertRun, getRunHistory, getRunDetails } from '../electron/utils/db';

describe('Benchmark Runner Lifecycle Integration', () => {

  beforeAll(() => {
    // Ensure test directories exist
    const testDbDir = path.join(__dirname, 'test-db-dir');
    if (!fs.existsSync(testDbDir)) {
      fs.mkdirSync(testDbDir, { recursive: true });
    }
    // Initialize DB
    initDB();
  });

  afterAll(() => {
    // Clean up test directories
    const testDbDir = path.join(__dirname, 'test-db-dir');
    const testLogsDir = path.join(__dirname, 'test-logs-dir');
    
    try {
      if (fs.existsSync(testDbDir)) {
        fs.rmSync(testDbDir, { recursive: true, force: true });
      }
      if (fs.existsSync(testLogsDir)) {
        fs.rmSync(testLogsDir, { recursive: true, force: true });
      }
    } catch (err) {
      console.error("Cleanup error in tests:", err);
    }
  });

  it('runs benchmark suite using mocked fetch and saves results to database', async () => {
    // Mock global fetch to return responses for a standard OpenAI compatible endpoint
    const mockFetch = vi.fn().mockImplementation((url: string, options?: any) => {
      // 1. Models list request
      if (url.endsWith('/v1/models')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            data: [{ id: 'mock-llama-8b', created: 1718300000 }]
          })
        });
      }
      
      // 2. Chat completion streaming request
      if (url.endsWith('/v1/chat/completions')) {
        // We simulate SSE stream text chunk
        const sseData = 
          'data: {"choices":[{"delta":{"content":"The answer is 5.5. "}}]}\n\n' +
          'data: {"choices":[{"delta":{"content":"3 - 1.5 + 4 = 5.5."}}]}\n\n' +
          'data: [DONE]\n';
          
        const encoder = new TextEncoder();
        const readableStream = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(sseData));
            controller.close();
          }
        });

        return Promise.resolve({
          ok: true,
          status: 200,
          body: readableStream
        });
      }

      // Default fallback
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve('Ollama is running')
      });
    });

    global.fetch = mockFetch;

    const runId = 'test-run-uuid-123';
    const config: BenchmarkConfig = {
      models: [{ id: 'mock-llama-8b', provider: 'MockOpenAI', url: 'http://localhost:9999' }],
      tasks: ['reasoning-apples'], // built-in task that expects "5.5" and uses numeric scorer
      concurrency: 1
    };

    // Call insertRun to register the run in DB first
    insertRun({
      id: runId,
      startedAt: Date.now(),
      tasks: config.tasks,
      models: config.models.map(m => m.id),
      settings: JSON.stringify({
        concurrency: config.concurrency
      })
    });

    const progressEvents: any[] = [];
    
    // Execute benchmark suite
    await runBenchmarkSuite(runId, config, [], (event) => {
      progressEvents.push(event);
    });

    // Assert progress events were sent
    expect(progressEvents.length).toBeGreaterThan(0);
    expect(progressEvents[0].type).toBe('started');
    
    const finishedEvent = progressEvents.find(e => e.type === 'finished');
    expect(finishedEvent).toBeDefined();

    // Assert results were saved in SQLite database
    const history = getRunHistory();
    expect(history.length).toBe(1);
    expect(history[0].id).toBe(runId);
    expect(history[0].models).toContain('mock-llama-8b');

    // Assert specific task details
    const details = getRunDetails(runId);
    expect(details).toBeDefined();
    expect(details.results.length).toBe(1);
    
    const result = details.results[0];
    expect(result.taskId).toBe('reasoning-apples');
    expect(result.modelId).toBe('mock-llama-8b');
    expect(result.score).toBe(1.0); // Answer was "5.5", which matches expectations exactly
    expect(result.error).toBeNull();
    expect(result.tps).toBeGreaterThan(0);
  });

});
