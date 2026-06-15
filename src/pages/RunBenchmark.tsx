import { useState, useEffect } from 'react';
import { useProvidersStore } from '../store/providersStore';
import { useBenchmarkStore } from '../store/benchmarkStore';
import { useSettingsStore } from '../store/settingsStore';
import type { BenchmarkTask } from '../types';
import { 
  Play, CheckSquare, Square, CheckCircle2, 
  XCircle, Clock, Zap, AlertTriangle, ShieldAlert, RefreshCw,
  Trash2
} from 'lucide-react';

interface RunBenchmarkProps {
  onBenchmarkFinished: (runId: string) => void;
}

export default function RunBenchmark({ onBenchmarkFinished }: RunBenchmarkProps) {
  const { models, providers, loadProviders } = useProvidersStore();
  const { 
    startBenchmark, cancelBenchmark, status, progress, 
    completedTasks, totalTasks, etaMs, results, currentRunningTask,
    resetBenchmark, lastCompletedRunId
  } = useBenchmarkStore();

  const [isDeleting, setIsDeleting] = useState<Record<string, boolean>>({});

  const handleDeleteModel = async (modelId: string, modelName: string) => {
    if (!window.confirm(`Are you sure you want to remove the model "${modelName}" (${modelId}) from your device?`)) {
      return;
    }

    setIsDeleting(prev => ({ ...prev, [modelId]: true }));
    try {
      const success = await window.electronAPI.deleteModel(modelId);
      if (success) {
        // Remove from selectedModels if it was selected
        setSelectedModels(prev => prev.filter(id => id !== modelId));
        await loadProviders();
      } else {
        alert("Failed to delete model.");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsDeleting(prev => ({ ...prev, [modelId]: false }));
    }
  };
  
  const settings = useSettingsStore();

  const [builtInTasks, setBuiltInTasks] = useState<BenchmarkTask[]>([]);
  // Selected models IDs
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  // Selected tasks IDs
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);

  // Local overrides
  const [temperature, setTemperature] = useState(settings.defaultTemperature);
  const [maxTokens, setMaxTokens] = useState(settings.defaultMaxTokens);
  const [timeout, setTimeoutVal] = useState(settings.defaultTimeout);
  const [concurrency, setConcurrency] = useState(settings.concurrency);

  // Load built-in tasks from IPC
  useEffect(() => {
    window.electronAPI.getBuiltInTasks().then(tasks => {
      setBuiltInTasks(tasks);
    });
  }, []);

  const allTasks = [...builtInTasks, ...settings.customTasks];

  // Group tasks by category
  const categories: Record<string, BenchmarkTask[]> = {
    speed: [], reasoning: [], coding: [], instruction: [], context: [], creative: []
  };
  for (const t of allTasks) {
    if (categories[t.category]) {
      categories[t.category].push(t as any);
    } else {
      categories[t.category] = [t as any];
    }
  }

  // Pre-select some common items on load
  useEffect(() => {
    // Select first two models if available
    if (models.length > 0) {
      setSelectedModels(models.slice(0, 2).map(m => m.id));
    }
    // Select speed, reasoning-apples, coding-palindrome by default
    setSelectedTasks(['speed-tps', 'reasoning-apples', 'coding-palindrome']);
  }, [models]);

  // Handle run success redirect — use lastCompletedRunId which is preserved after activeRunId is cleared
  useEffect(() => {
    if (status === 'completed' && lastCompletedRunId) {
      const completedId = lastCompletedRunId;
      resetBenchmark();
      onBenchmarkFinished(completedId);
    }
  }, [status, lastCompletedRunId, onBenchmarkFinished, resetBenchmark]);

  const handleRun = async () => {
    if (selectedModels.length === 0 || selectedTasks.length === 0) return;

    const modelsToRun = selectedModels.map(id => {
      const found = models.find(m => m.id === id);
      return {
        id,
        provider: found?.provider ?? 'Ollama',
        url: providers.find(p => p.name === found?.provider)?.url
      };
    });

    await startBenchmark({
      models: modelsToRun,
      tasks: selectedTasks,
      concurrency,
      temperature,
      maxTokens,
      timeoutMs: timeout * 1000,
      apiKeys: settings.apiKeys
    }, settings.customTasks);
  };

  // Group models by provider
  const modelsByProvider: Record<string, typeof models> = {};
  for (const m of models) {
    if (!modelsByProvider[m.provider]) {
      modelsByProvider[m.provider] = [];
    }
    modelsByProvider[m.provider].push(m);
  }

  const toggleTask = (id: string) => {
    if (selectedTasks.includes(id)) {
      setSelectedTasks(selectedTasks.filter(t => t !== id));
    } else {
      setSelectedTasks([...selectedTasks, id]);
    }
  };

  const toggleCategory = (category: string) => {
    const taskIds = categories[category].map(t => t.id);
    const allSelected = taskIds.every(id => selectedTasks.includes(id));
    if (allSelected) {
      setSelectedTasks(selectedTasks.filter(id => !taskIds.includes(id)));
    } else {
      const filtered = selectedTasks.filter(id => !taskIds.includes(id));
      setSelectedTasks([...filtered, ...taskIds]);
    }
  };

  const toggleModel = (id: string) => {
    if (selectedModels.includes(id)) {
      setSelectedModels(selectedModels.filter(m => m !== id));
    } else {
      setSelectedModels([...selectedModels, id]);
    }
  };

  const toggleProviderModels = (provider: string) => {
    const modelIds = modelsByProvider[provider].map(m => m.id);
    const allSelected = modelIds.every(id => selectedModels.includes(id));
    if (allSelected) {
      setSelectedModels(selectedModels.filter(id => !modelIds.includes(id)));
    } else {
      const filtered = selectedModels.filter(id => !modelIds.includes(id));
      setSelectedModels([...filtered, ...modelIds]);
    }
  };

  const formatTime = (ms: number) => {
    if (ms <= 0) return '0s';
    const totalSecs = Math.round(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  return (
    <div className="space-y-6 select-none relative">
      
      {/* Title */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Run Benchmark</h2>
        <p className="text-sm text-muted-foreground">Select models and tasks to orchestrate custom evaluations.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2/3: Task selection panel */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-base font-bold">1. Select Evaluation Tasks</h3>
            <span className="text-xs text-muted-foreground font-semibold">
              {selectedTasks.length} tasks selected
            </span>
          </div>

          <div className="space-y-4">
            {Object.entries(categories).map(([category, tasks]) => {
              if (tasks.length === 0) return null;
              const isCatSelected = tasks.every(t => selectedTasks.includes(t.id));
              
              return (
                <div key={category} className="p-4 rounded-xl bg-card border border-border shadow-sm">
                  {/* Category Header */}
                  <div className="flex justify-between items-center border-b border-border/40 pb-2 mb-3">
                    <h4 className="text-xs font-bold uppercase text-primary tracking-wider capitalize">
                      {category} Evaluators
                    </h4>
                    <button 
                      onClick={() => toggleCategory(category)}
                      className="text-[10px] font-bold text-muted-foreground hover:text-foreground hover:underline"
                    >
                      {isCatSelected ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>

                  {/* Tasks List */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {tasks.map(t => {
                      const isChecked = selectedTasks.includes(t.id);
                      return (
                        <div 
                          key={t.id}
                          onClick={() => toggleTask(t.id)}
                          className={`p-3 rounded-lg border cursor-pointer flex items-start gap-3 transition-all duration-150 ${
                            isChecked 
                              ? 'bg-primary/5 border-primary/45 shadow-sm' 
                              : 'bg-secondary/20 border-border hover:bg-secondary/40'
                          }`}
                        >
                          <div className="mt-0.5 shrink-0 text-primary">
                            {isChecked ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4 text-muted-foreground" />}
                          </div>
                          <div>
                            <h5 className="text-xs font-bold text-foreground leading-tight">{t.name}</h5>
                            <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{t.description}</p>
                            <span className="text-[9px] font-bold text-muted-foreground/80 mt-1.5 block">
                              Max Tokens: {t.maxTokens} | Scorer: {t.scorerType}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right 1/3: Model selection panel */}
        <div className="lg:col-span-1 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-base font-bold">2. Select LLM Models</h3>
            <span className="text-xs text-muted-foreground font-semibold">
              {selectedModels.length} models selected
            </span>
          </div>

          <div className="space-y-4 max-h-[500px] overflow-y-auto border border-border rounded-xl p-4 bg-card shadow-sm">
            {Object.entries(modelsByProvider).map(([provider, providerModels]) => {
              const allSel = providerModels.every(m => selectedModels.includes(m.id));
              
              return (
                <div key={provider} className="space-y-2.5">
                  <div className="flex justify-between items-center border-b border-border/40 pb-1.5">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      {provider}
                    </span>
                    <button 
                      onClick={() => toggleProviderModels(provider)}
                      className="text-[10px] font-bold text-muted-foreground hover:text-foreground hover:underline"
                    >
                      {allSel ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    {providerModels.map(m => {
                      const isChecked = selectedModels.includes(m.id);
                      return (
                        <div 
                          key={m.id}
                          onClick={() => toggleModel(m.id)}
                          className={`p-2.5 rounded-lg border cursor-pointer flex items-center justify-between text-xs transition-all duration-150 ${
                            isChecked 
                              ? 'bg-primary/5 border-primary/45 font-semibold' 
                              : 'hover:bg-secondary/40 border-border/80'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 truncate">
                            <span className="text-primary mt-0.5 shrink-0">
                              {isChecked ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4 text-muted-foreground" />}
                            </span>
                            <span className="truncate" title={m.name}>{m.name.split('/').pop()}</span>
                          </div>
                          
                          <div className="flex items-center gap-1.5 shrink-0 select-none">
                            {m.size !== undefined && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-secondary text-muted-foreground uppercase leading-none">
                                {m.size}B
                              </span>
                            )}
                            {m.provider.toLowerCase() === 'ollama' && (
                              <button
                                disabled={isDeleting[m.id]}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteModel(m.id, m.name);
                                }}
                                className="p-1 rounded hover:bg-red-500/10 text-red-500 hover:text-red-400 transition-colors cursor-pointer disabled:opacity-50"
                                title="Delete model from device"
                              >
                                {isDeleting[m.id] ? (
                                  <RefreshCw className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3.5 w-3.5" />
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {models.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8">
                No local models available. Rescan on Providers page.
              </p>
            )}
          </div>
        </div>

      </div>

      {/* Bottom Settings Strip & CTA */}
      <div className="p-4 rounded-xl bg-card border border-border shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        
        {/* Custom Params Inputs */}
        <div className="grid grid-cols-2 md:flex items-center gap-4 text-xs">
          
          {/* Temperature */}
          <div className="space-y-1">
            <span className="text-muted-foreground font-semibold flex items-center gap-1">
              Temperature ({temperature})
            </span>
            <input 
              type="range" 
              min="0.0" 
              max="1.0" 
              step="0.1"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="w-28 accent-primary"
            />
          </div>

          {/* Max Tokens */}
          <div className="space-y-1">
            <span className="text-muted-foreground font-semibold">Max Tokens</span>
            <div className="flex items-center gap-1.5">
              <input 
                type="number" 
                min="64" 
                max="8192" 
                value={maxTokens}
                onChange={(e) => setMaxTokens(parseInt(e.target.value) || 512)}
                className="form-input text-xs h-7 w-20 px-1.5 font-semibold"
              />
              <div className="flex gap-1 shrink-0">
                {[256, 512, 1024, 2048, 4096].map(preset => (
                  <button
                    type="button"
                    key={preset}
                    onClick={() => setMaxTokens(preset)}
                    className={`h-7 px-1.5 rounded text-[10px] font-bold border transition-all duration-150 ${
                      maxTokens === preset
                        ? 'bg-primary/15 border-primary/30 text-primary shadow-sm shadow-primary/5'
                        : 'bg-secondary/40 border-border/80 text-muted-foreground hover:bg-secondary hover:text-foreground'
                    }`}
                  >
                    {preset === 1024 ? '1K' : preset === 2048 ? '2K' : preset === 4096 ? '4K' : preset}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Task Timeout */}
          <div className="space-y-1">
            <span className="text-muted-foreground font-semibold">Timeout (sec)</span>
            <input 
              type="number" 
              min="10" 
              max="600" 
              value={timeout}
              onChange={(e) => setTimeoutVal(parseInt(e.target.value) || 120)}
              className="form-input text-xs h-7 w-20 px-1.5"
            />
          </div>

          {/* Concurrency */}
          <div className="space-y-1">
            <span className="text-muted-foreground font-semibold flex items-center gap-1">
                Concurrency
                {concurrency > 1 && (
                  <span title="Values >1 can distort model TPS.">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                  </span>
                )}
            </span>
            <input 
              type="number" 
              min="1" 
              max="4" 
              value={concurrency}
              onChange={(e) => setConcurrency(parseInt(e.target.value) || 1)}
              className="form-input text-xs h-7 w-16 px-1.5"
            />
          </div>

        </div>

        {/* CTA button */}
        <button
          onClick={handleRun}
          disabled={selectedModels.length === 0 || selectedTasks.length === 0 || status === 'running'}
          className="btn-primary h-10 px-6 font-bold flex items-center gap-2 text-xs shrink-0 disabled:opacity-50 disabled:pointer-events-none"
        >
          <Play className="h-4 w-4 fill-current" />
          Run Benchmark
        </button>
      </div>

      {/* Warnings strip */}
      {concurrency > 1 && (
        <div className="p-3.5 rounded-lg border border-amber-500/20 bg-amber-500/5 text-amber-500 text-xs flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>
            <strong>Warning:</strong> Task concurrency of {concurrency} detected. Running multiple tasks on the same model concurrently introduces hardware thrashing and will skew TPS (Tokens Per Second) speed benchmarks. Respect concurrency = 1 for accurate scores.
          </span>
        </div>
      )}

      {/* Running Benchmark Progress Overlay Modal */}
      {status === 'running' && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-card border border-border rounded-xl shadow-2xl p-6 space-y-6">
            
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold">Benchmark Progress</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Evaluating local models across selected test suites.</p>
              </div>
              <button 
                onClick={cancelBenchmark}
                className="btn-destructive text-xs h-8 px-3"
              >
                Abort Run
              </button>
            </div>

            {/* Overall progress bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-primary">Evaluation Progress ({progress}%)</span>
                <span>{completedTasks} / {totalTasks} Tasks Completed</span>
              </div>
              <div className="h-3 w-full bg-secondary rounded-full overflow-hidden border border-border">
                <div 
                  className="h-full bg-primary transition-all duration-300 rounded-full" 
                  style={{ width: `${progress}%` }}
                />
              </div>
              
              {/* ETA Display */}
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  ETA Remaining: {etaMs > 0 ? formatTime(etaMs) : 'Estimating...'}
                </span>
                <span>Completed tasks run offline.</span>
              </div>
            </div>

            {/* Live activity per model */}
            <div className="space-y-2 border-t border-border pt-4">
              <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Live Models Status</h4>
              <div className="space-y-2.5 max-h-52 overflow-y-auto pr-1">
                {selectedModels.map(mId => {
                  const cleanMName = mId.split('/').pop()?.split(':')?.[0] ?? mId;
                  
                  // Check current active task
                  const isActive = currentRunningTask?.modelId === mId;
                  const currentTask = isActive ? allTasks.find(t => t.id === currentRunningTask?.taskId)?.name : null;
                  
                  // Count completed tasks for this model
                  const modelResults = results.filter(r => r.modelId === mId);
                  const modelCompletedCount = modelResults.length;
                  const modelErrCount = modelResults.filter(r => r.error).length;

                  // Average TPS for this model so far
                  const validResults = modelResults.filter(r => !r.error && r.tps > 0);
                  const avgTps = validResults.length > 0 
                    ? Math.round(validResults.reduce((acc, curr) => acc + curr.tps, 0) / validResults.length)
                    : 0;

                  return (
                    <div key={mId} className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/35 border border-border/80 text-xs">
                      <div className="flex items-center gap-3 truncate max-w-[300px]">
                        {/* Status Icon */}
                        {modelCompletedCount === selectedTasks.length ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                        ) : modelErrCount > 0 && modelCompletedCount === selectedTasks.length ? (
                          <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                        ) : isActive ? (
                          <RefreshCw className="h-4 w-4 text-primary animate-spin shrink-0" />
                        ) : (
                          <Clock className="h-4 w-4 text-muted-foreground/60 shrink-0" />
                        )}
                        
                        <div className="truncate">
                          <span className="font-semibold block truncate">{cleanMName}</span>
                          <span className="text-[10px] text-muted-foreground block truncate">
                            {isActive ? `Running: ${currentTask}` : modelCompletedCount === selectedTasks.length ? 'Completed' : 'Queued'}
                          </span>
                        </div>
                      </div>

                      <div className="flex gap-4 items-center shrink-0">
                        {/* Live TPS display */}
                        {avgTps > 0 && (
                          <span className="flex items-center gap-1 font-semibold text-amber-500 text-[10px]">
                            <Zap className="h-3 w-3 fill-current" />
                            {avgTps} TPS avg
                          </span>
                        )}
                        <span className="text-[10px] font-bold text-muted-foreground">
                          {modelCompletedCount} / {selectedTasks.length} Done
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
