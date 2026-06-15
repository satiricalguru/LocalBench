import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Provider operations
  discoverProviders: () => ipcRenderer.invoke('discover-providers'),
  getModels: (providerName?: string) => ipcRenderer.invoke('get-models', providerName),
  testProvider: (name: string, url: string) => ipcRenderer.invoke('test-provider', name, url),

  // Benchmark operations
  startBenchmark: (config: any) => ipcRenderer.invoke('start-benchmark', config),
  cancelBenchmark: (runId: string) => ipcRenderer.invoke('cancel-benchmark', runId),
  getBuiltInTasks: () => ipcRenderer.invoke('get-built-in-tasks'),
  onBenchmarkProgress: (callback: (event: any) => void) => {
    const subscription = (_event: any, data: any) => callback(data);
    ipcRenderer.on('benchmark-progress', subscription);
    return () => {
      ipcRenderer.removeListener('benchmark-progress', subscription);
    };
  },
  onTaskComplete: (callback: (result: any) => void) => {
    const subscription = (_event: any, data: any) => callback(data);
    ipcRenderer.on('task-complete', subscription);
    return () => {
      ipcRenderer.removeListener('task-complete', subscription);
    };
  },

  // History & DB
  getRunHistory: (limit?: number) => ipcRenderer.invoke('get-run-history', limit),
  getRunDetails: (runId: string) => ipcRenderer.invoke('get-run-details', runId),
  deleteRun: (runId: string) => ipcRenderer.invoke('delete-run', runId),
  clearAllHistory: () => ipcRenderer.invoke('clear-all-history'),
  getDatabasePath: () => ipcRenderer.invoke('get-database-path'),
  backupDatabase: () => ipcRenderer.invoke('backup-database'),
  exportRun: (runId: string, format: 'json' | 'csv') => ipcRenderer.invoke('export-run', runId, format),

  // System info
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),

  // Native utilities
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  startPullModel: (url: string, modelName: string) => ipcRenderer.invoke('start-pull-model', url, modelName),
  cancelPullModel: (modelName: string) => ipcRenderer.invoke('cancel-pull-model', modelName),
  deleteModel: (modelName: string) => ipcRenderer.invoke('delete-model', modelName),
  startOllamaServer: () => ipcRenderer.invoke('start-ollama-server'),
  stopOllamaServer: () => ipcRenderer.invoke('stop-ollama-server'),
  onModelPullProgress: (callback: (data: any) => void) => {
    const subscription = (_event: any, data: any) => callback(data);
    ipcRenderer.on('model-pull-progress', subscription);
    return () => {
      ipcRenderer.removeListener('model-pull-progress', subscription);
    };
  },

  // Playground operations
  playgroundChat: (params: any) => ipcRenderer.invoke('playground-chat', params),
  playgroundCancel: (streamId: string) => ipcRenderer.invoke('playground-cancel', streamId),
  onPlaygroundToken: (callback: (data: any) => void) => {
    const subscription = (_event: any, data: any) => callback(data);
    ipcRenderer.on('playground-token', subscription);
    return () => {
      ipcRenderer.removeListener('playground-token', subscription);
    };
  }
});
