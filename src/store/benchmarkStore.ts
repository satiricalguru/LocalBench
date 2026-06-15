import { create } from 'zustand';
import type { TaskResult } from '../types';

interface BenchmarkState {
  activeRunId: string | null;
  lastCompletedRunId: string | null;
  status: 'idle' | 'running' | 'completed' | 'cancelled' | 'error';
  totalTasks: number;
  completedTasks: number;
  progress: number; // 0 - 100
  etaMs: number;
  currentRunningTask: { modelId: string; taskId: string } | null;
  results: TaskResult[];
  error: string | null;
  startBenchmark: (config: {
    models: Array<{ id: string; provider: string; url?: string }>;
    tasks: string[];
    concurrency: number;
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
    apiKeys?: {
      openai?: string;
      anthropic?: string;
      gemini?: string;
      openrouter?: string;
    };
  }, customTasks?: any[]) => Promise<string>;
  cancelBenchmark: () => Promise<void>;
  resetBenchmark: () => void;
}

let unsubscribeProgress: (() => void) | null = null;

export const useBenchmarkStore = create<BenchmarkState>((set, get) => ({
  activeRunId: null,
  lastCompletedRunId: null,
  status: 'idle',
  totalTasks: 0,
  completedTasks: 0,
  progress: 0,
  etaMs: 0,
  currentRunningTask: null,
  results: [],
  error: null,

  startBenchmark: async (config, customTasks) => {
    // Unsubscribe from previous listener if any
    if (unsubscribeProgress) {
      unsubscribeProgress();
      unsubscribeProgress = null;
    }

    set({
      status: 'running',
      completedTasks: 0,
      progress: 0,
      etaMs: 0,
      currentRunningTask: null,
      results: [],
      error: null
    });

    try {
      const runId = await window.electronAPI.startBenchmark({ config, customTasks });
      set({ activeRunId: runId });

      // Subscribe to progress events
      unsubscribeProgress = window.electronAPI.onBenchmarkProgress((event) => {
        const { type, payload } = event;

        if (type === 'started') {
          set({ totalTasks: payload.totalTasks ?? 0 });
        } else if (type === 'task_start') {
          set({
            currentRunningTask: {
              modelId: payload.modelId ?? '',
              taskId: payload.taskId ?? ''
            }
          });
        } else if (type === 'task_complete') {
          if (payload.result) {
            set((state) => ({
              results: [...state.results, payload.result!],
              completedTasks: state.completedTasks + 1,
              progress: Math.round((payload.progress ?? 0) * 100),
              etaMs: payload.etaMs ?? 0
            }));
          }
        } else if (type === 'finished') {
          set((state) => ({
            status: 'completed',
            currentRunningTask: null,
            lastCompletedRunId: state.activeRunId,
            activeRunId: null
          }));
          if (unsubscribeProgress) {
            unsubscribeProgress();
            unsubscribeProgress = null;
          }
        } else if (type === 'error') {
          // Don't overwrite 'cancelled' status - cancellation may trigger error events
          if (get().status === 'cancelled') return;
          set({
            status: 'error',
            error: payload.error ?? 'Unknown run error',
            currentRunningTask: null,
            activeRunId: null
          });
          if (unsubscribeProgress) {
            unsubscribeProgress();
            unsubscribeProgress = null;
          }
        }
      });

      return runId;
    } catch (err: any) {
      set({ status: 'error', error: err?.message ?? 'Failed to start benchmark' });
      throw err;
    }
  },

  cancelBenchmark: async () => {
    const runId = get().activeRunId;
    if (runId) {
      await window.electronAPI.cancelBenchmark(runId);
      set({
        status: 'cancelled',
        currentRunningTask: null,
        activeRunId: null
      });
      if (unsubscribeProgress) {
        unsubscribeProgress();
        unsubscribeProgress = null;
      }
    }
  },

  resetBenchmark: () => {
    set({
      activeRunId: null,
      lastCompletedRunId: null,
      status: 'idle',
      totalTasks: 0,
      completedTasks: 0,
      progress: 0,
      etaMs: 0,
      currentRunningTask: null,
      results: [],
      error: null
    });
  }
}));
