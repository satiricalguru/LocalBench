import { ProviderStatus, ModelInfo, Run, RunWithResults, SystemInfo, ProgressEvent, TaskResult, BenchmarkTask } from './types';

export interface IElectronAPI {
  discoverProviders(): Promise<ProviderStatus[]>;
  getModels(providerName?: string): Promise<ModelInfo[]>;
  testProvider(name: string, url: string): Promise<boolean>;
  startBenchmark(params: {
    config: {
      models: Array<{ id: string; provider: string; url?: string }>;
      tasks: string[];
      concurrency: number;
      temperature?: number;
      maxTokens?: number;
      timeoutMs?: number;
    };
    customTasks?: any[];
  }): Promise<string>;
  cancelBenchmark(runId: string): Promise<void>;
  getBuiltInTasks(): Promise<BenchmarkTask[]>;
  onBenchmarkProgress(callback: (event: ProgressEvent) => void): () => void;
  onTaskComplete(callback: (result: TaskResult) => void): () => void;
  getRunHistory(limit?: number): Promise<Run[]>;
  getRunDetails(runId: string): Promise<RunWithResults>;
  deleteRun(runId: string): Promise<void>;
  clearAllHistory(): Promise<void>;
  getDatabasePath(): Promise<string>;
  backupDatabase(): Promise<string | null>;
  exportRun(runId: string, format: 'json' | 'csv'): Promise<string | null>;
  getSystemInfo(): Promise<SystemInfo>;
  openExternal(url: string): Promise<void>;
  startPullModel(url: string, modelName: string): Promise<boolean>;
  cancelPullModel(modelName: string): Promise<void>;
  deleteModel(modelName: string): Promise<boolean>;
  startOllamaServer(): Promise<boolean>;
  stopOllamaServer(): Promise<boolean>;
  onModelPullProgress(callback: (data: {
    modelName: string;
    status: string;
    completed?: number;
    total?: number;
    percentage: number;
    done: boolean;
    error?: string;
  }) => void): () => void;
  playgroundChat(params: {
    providerName: string;
    url?: string;
    modelId: string;
    messages: Array<{ role: string; content: string }>;
    temperature: number;
    maxTokens: number;
    streamId: string;
  }): Promise<boolean>;
  playgroundCancel(streamId: string): Promise<void>;
  onPlaygroundToken(callback: (data: {
    streamId: string;
    content: string;
    done: boolean;
    error?: string;
  }) => void): () => void;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}
