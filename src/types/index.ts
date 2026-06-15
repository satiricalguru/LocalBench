export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  size?: number;
  quantization?: string;
  contextLength?: number;
  family?: string;
  modifiedAt?: string;
  sizeOnDisk?: number;
}

export interface BenchmarkTask {
  id: string;
  category: 'speed' | 'reasoning' | 'coding' | 'instruction' | 'context' | 'creative';
  name: string;
  description: string;
  prompt: string;
  systemPrompt?: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
  expectedOutput?: string;
  scorerType: string;
}

export interface TaskResult {
  id: string;
  runId: string;
  taskId: string;
  modelId: string;
  provider: string;
  score: number;
  ttft: number; // ms
  tps: number;  // tokens/sec
  totalLatency: number; // ms
  promptTokens: number;
  completionTokens: number;
  rawResponse: string;
  error?: string;
  timestamp: number;
}

export interface ProviderStatus {
  name: string;
  url: string;
  isConnected: boolean;
  modelCount: number;
}

export interface Run {
  id: string;
  startedAt: number;
  finishedAt: number | null;
  tasks: string[];
  models: string[];
  settings: {
    concurrency: number;
    temperature: number;
    maxTokens: number;
    timeoutMs: number;
    weights?: {
      quality: number;
      speed: number;
      ttft: number;
    };
  } | null;
  avgScore: number | null;
}

export interface RunWithResults extends Run {
  results: TaskResult[];
}

export interface SystemInfo {
  cpuBrand: string;
  ramTotalGB: number;
  ramAvailableGB: number;
  gpuBrand: string;
  gpuVramMB?: number;
  platform: string;
  arch: string;
  isAppleSilicon: boolean;
}

export interface ProgressEvent {
  type: 'started' | 'task_start' | 'task_complete' | 'finished' | 'error';
  payload: {
    runId: string;
    totalTasks?: number;
    taskId?: string;
    modelId?: string;
    result?: TaskResult;
    progress?: number; // 0.0 - 1.0
    etaMs?: number;
    error?: string;
  };
}
