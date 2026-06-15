import { useState, useEffect } from 'react';
import { useProvidersStore } from '../store/providersStore';
import { useBenchmarkStore } from '../store/benchmarkStore';
import { useSettingsStore } from '../store/settingsStore';
import type { Run } from '../types';
import { Play, Cpu, Zap, Award, Clock, ArrowRight, RefreshCw, Trash2 } from 'lucide-react';

interface DashboardProps {
  onNavigateToRun: () => void;
  onNavigateToResults: (runId: string) => void;
  onNavigateToProviders: () => void;
}

export default function Dashboard({ 
  onNavigateToRun, 
  onNavigateToResults, 
  onNavigateToProviders 
}: DashboardProps) {
  const { providers, models, loadProviders } = useProvidersStore();

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
  const { startBenchmark, status } = useBenchmarkStore();
  const { customTasks, defaultTemperature, defaultMaxTokens, defaultTimeout } = useSettingsStore();

  const [history, setHistory] = useState<Run[]>([]);
  const [stats, setStats] = useState({
    fastestModel: 'N/A',
    fastestTps: 0,
    bestQualityModel: 'N/A',
    bestQualityScore: 0,
    lastRunDate: 'Never'
  });

  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('speed');

  // Load history & compute stats
  const fetchDashboardData = async () => {
    try {
      const runs = await window.electronAPI.getRunHistory(5);
      setHistory(runs);

      // Compute statistics over all history
      const allRuns = await window.electronAPI.getRunHistory();
      if (allRuns.length > 0) {
        let maxTps = 0;
        let maxTpsModel = 'N/A';
        let maxQuality = 0;
        let maxQualityModel = 'N/A';

        // Load details for the top runs to get raw values if possible, or extract averages
        for (const r of allRuns) {
          const details = await window.electronAPI.getRunDetails(r.id);
          if (details && details.results) {
            for (const res of details.results) {
              if (res.error) continue;
              if (res.tps && res.tps > maxTps) {
                maxTps = res.tps;
                maxTpsModel = res.modelId;
              }
              if (res.score && res.score > maxQuality) {
                maxQuality = res.score;
                maxQualityModel = res.modelId;
              }
            }
          }
        }

        // Clean names
        const cleanName = (name: string) => {
          return name.split('/').pop()?.split(':')?.[0] ?? name;
        };

        const lastRun = allRuns[0];
        let lastRunDateStr = 'Never';
        if (lastRun && lastRun.startedAt) {
          const d = new Date(lastRun.startedAt);
          if (!isNaN(d.getTime())) {
            lastRunDateStr = d.toLocaleString(undefined, {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            });
          }
        }

        setStats({
          fastestModel: maxTpsModel !== 'N/A' ? `${cleanName(maxTpsModel)}` : 'N/A',
          fastestTps: Math.round(maxTps),
          bestQualityModel: maxQualityModel !== 'N/A' ? `${cleanName(maxQualityModel)}` : 'N/A',
          bestQualityScore: Math.round(maxQuality * 100),
          lastRunDate: lastRunDateStr
        });
      }
    } catch (err) {
      console.error("Failed to load dashboard data:", err);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [models]);

  const handleQuickRun = async () => {
    if (selectedModels.length === 0) return;

    // Map selected model IDs back to model info objects
    const modelsToRun = selectedModels.map(id => {
      const found = models.find(m => m.id === id);
      return {
        id,
        provider: found?.provider ?? 'Ollama',
        url: providers.find(p => p.name === found?.provider)?.url
      };
    });

    // Map tasks in chosen category
    // Default built-in tasks categories
    const categoryTasks = [
      { id: 'speed-tps', category: 'speed' },
      { id: 'reasoning-apples', category: 'reasoning' },
      { id: 'reasoning-syllogisms', category: 'reasoning' },
      { id: 'coding-palindrome', category: 'coding' },
      { id: 'coding-bug', category: 'coding' },
      { id: 'instruction-countries', category: 'instruction' },
      { id: 'instruction-translation', category: 'instruction' },
      { id: 'context-reading', category: 'context' },
      { id: 'creative-haiku', category: 'creative' }
    ];

    const allTasks = [
      ...categoryTasks,
      ...customTasks.map(t => ({ id: t.id, category: t.category }))
    ];

    const tasksToRun = allTasks
      .filter(t => t.category === selectedCategory)
      .map(t => t.id);

    if (tasksToRun.length === 0) return;

    try {
      const runId = await startBenchmark({
        models: modelsToRun,
        tasks: tasksToRun,
        concurrency: 1,
        temperature: defaultTemperature,
        maxTokens: defaultMaxTokens,
        timeoutMs: defaultTimeout * 1000
      }, customTasks);

      onNavigateToResults(runId);
    } catch (err) {
      console.error(err);
    }
  };

  const handleModelToggle = (modelId: string) => {
    if (selectedModels.includes(modelId)) {
      setSelectedModels(selectedModels.filter(id => id !== modelId));
    } else {
      if (selectedModels.length >= 3) {
        // limit 3 models for quick run
        setSelectedModels([...selectedModels.slice(1), modelId]);
      } else {
        setSelectedModels([...selectedModels, modelId]);
      }
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Top Header Row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-sm text-muted-foreground">Quick insights into your local LLM performance.</p>
        </div>
        <button 
          onClick={fetchDashboardData}
          className="btn-secondary h-9 flex items-center gap-1.5 text-xs"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh Stats
        </button>
      </div>

      {/* Grid of 4 Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Card 1: Models Available */}
        <div className="p-5 rounded-xl bg-card border border-border shadow-sm flex items-center gap-4">
          <div className="p-3 rounded-lg bg-primary/10 text-primary">
            <Cpu className="h-6 w-6" />
          </div>
          <div>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Models Discovered</span>
            <h3 className="text-2xl font-bold mt-0.5">{models.length}</h3>
          </div>
        </div>

        {/* Card 2: Fastest Model */}
        <div className="p-5 rounded-xl bg-card border border-border shadow-sm flex items-center gap-4">
          <div className="p-3 rounded-lg bg-amber-500/10 text-amber-500">
            <Zap className="h-6 w-6" />
          </div>
          <div>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fastest Generation</span>
            <h3 className="text-lg font-bold mt-0.5 truncate max-w-[170px]" title={stats.fastestModel}>
              {stats.fastestModel}
            </h3>
            {stats.fastestTps > 0 && (
              <span className="text-xs font-semibold text-amber-500">{stats.fastestTps} tokens/sec</span>
            )}
          </div>
        </div>

        {/* Card 3: Best Quality Model */}
        <div className="p-5 rounded-xl bg-card border border-border shadow-sm flex items-center gap-4">
          <div className="p-3 rounded-lg bg-emerald-500/10 text-emerald-500">
            <Award className="h-6 w-6" />
          </div>
          <div>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Highest Quality</span>
            <h3 className="text-lg font-bold mt-0.5 truncate max-w-[170px]" title={stats.bestQualityModel}>
              {stats.bestQualityModel}
            </h3>
            {stats.bestQualityScore > 0 && (
              <span className="text-xs font-semibold text-emerald-500">{stats.bestQualityScore}% Score</span>
            )}
          </div>
        </div>

        {/* Card 4: Last Run Time */}
        <div className="p-5 rounded-xl bg-card border border-border shadow-sm flex items-center gap-4">
          <div className="p-3 rounded-lg bg-violet-500/10 text-violet-500">
            <Clock className="h-6 w-6" />
          </div>
          <div>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Last Test Run</span>
            <h3 className="text-base font-bold mt-0.5 truncate max-w-[180px]">
              {stats.lastRunDate}
            </h3>
          </div>
        </div>

      </div>

      {/* Provider Status Strip */}
      <div className="p-4 rounded-xl bg-card border border-border shadow-sm">
        <div className="flex items-center justify-between mb-3.5">
          <h4 className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Connection Status Registry</h4>
          <button 
            onClick={onNavigateToProviders}
            className="text-xs font-semibold text-primary flex items-center gap-1 hover:underline"
          >
            Manage Connections
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>
        <div className="flex flex-wrap gap-4">
          {providers.map(p => (
            <div 
              key={p.name} 
              onClick={onNavigateToProviders}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary/40 border border-border/60 hover:bg-secondary cursor-pointer transition-all duration-150"
            >
              <span className={`h-2.5 w-2.5 rounded-full ${p.isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
              <span className="text-sm font-semibold">{p.name}</span>
              <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-muted/80 text-muted-foreground">
                {p.isConnected ? `${p.modelCount} models` : 'offline'}
              </span>
            </div>
          ))}
          {providers.length === 0 && (
            <p className="text-xs text-muted-foreground py-1">No providers registered. Rescan connections.</p>
          )}
        </div>
      </div>

      {/* Quick Run and Recent Runs Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 1/3: Quick Run Panel */}
        <div className="lg:col-span-1 p-5 rounded-xl bg-card border border-border shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-base font-bold">Quick Benchmark Console</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Test quality & speed in one click.</p>
            
            {/* Pick Models (Max 3) */}
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-muted-foreground block">Select Models</label>
                {selectedModels.length >= 3 && (
                  <span className="text-[10px] font-bold text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">Max 3</span>
                )}
              </div>
              <div className="max-h-40 overflow-y-auto border border-border rounded-lg p-2 space-y-1">
                {models.map(m => {
                  const isChecked = selectedModels.includes(m.id);
                  return (
                    <div
                      key={m.id}
                      className={`w-full px-2 py-1.5 rounded text-xs flex items-center justify-between transition-colors ${
                        isChecked 
                          ? 'bg-primary/10 text-primary font-semibold' 
                          : 'hover:bg-secondary/40 text-foreground'
                      }`}
                    >
                      <span 
                        onClick={() => handleModelToggle(m.id)}
                        className="truncate pr-2 cursor-pointer flex-1 text-left" 
                        title={m.name}
                      >
                        {m.name}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0 select-none">
                        <span className="text-[10px] uppercase font-bold opacity-70">
                          {m.provider}
                        </span>
                        {m.provider.toLowerCase() === 'ollama' && (
                          <button
                            disabled={isDeleting[m.id]}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteModel(m.id, m.name);
                            }}
                            className="p-0.5 rounded hover:bg-red-500/10 text-red-500 hover:text-red-400 transition-colors cursor-pointer disabled:opacity-50"
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
                {models.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">No models found. Make sure Ollama or LM Studio is running.</p>
                )}
              </div>
            </div>

            {/* Pick Category */}
            <div className="mt-4 space-y-2">
              <label className="text-xs font-bold text-muted-foreground block">Select Task Category</label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="form-input text-xs"
              >
                <option value="speed">Speed & Latency</option>
                <option value="reasoning">Reasoning & Math</option>
                <option value="coding">Code Generation</option>
                <option value="instruction">Instruction Following</option>
                <option value="context">Long Context Retrieval</option>
                <option value="creative">Creative Writing</option>
              </select>
            </div>
          </div>

          <button
            onClick={handleQuickRun}
            disabled={selectedModels.length === 0 || status === 'running'}
            className="w-full btn-primary h-9 flex items-center justify-center gap-2 mt-5 disabled:opacity-50 text-xs"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            Run Quick Benchmark
          </button>
        </div>

        {/* Right 2/3: Recent Runs Table */}
        <div className="lg:col-span-2 p-5 rounded-xl bg-card border border-border shadow-sm">
          <h3 className="text-base font-bold">Recent Benchmark Runs</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Explore results from past testing sessions.</p>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border text-muted-foreground font-semibold">
                  <th className="py-2.5">Date & Time</th>
                  <th className="py-2.5">Models Benchmarked</th>
                  <th className="py-2.5 text-center">Tasks</th>
                  <th className="py-2.5 text-right">Avg Quality</th>
                  <th className="py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {history.map(run => {
                  const cleanModelName = (id: string) => id.split('/').pop()?.split(':')?.[0] ?? id;
                  const modelsSummary = run.models.map(m => cleanModelName(m)).join(', ');
                  
                  return (
                    <tr key={run.id} className="hover:bg-secondary/20 transition-colors">
                      <td className="py-3 font-medium text-foreground">
                        {run.startedAt && !isNaN(new Date(run.startedAt).getTime())
                          ? new Date(run.startedAt).toLocaleString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })
                          : 'Unknown Date'}
                      </td>
                      <td className="py-3 font-semibold text-foreground max-w-[200px] truncate" title={modelsSummary}>
                        {modelsSummary}
                      </td>
                      <td className="py-3 text-center text-muted-foreground font-medium">
                        {run.tasks.length}
                      </td>
                      <td className="py-3 text-right font-bold text-emerald-500">
                        {run.avgScore !== null ? `${Math.round(run.avgScore * 100)}%` : 'N/A'}
                      </td>
                      <td className="py-3 text-right">
                        <button
                          onClick={() => onNavigateToResults(run.id)}
                          className="text-primary hover:underline font-semibold"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {history.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-muted-foreground">
                      <Clock className="h-8 w-8 mx-auto opacity-30 mb-2" />
                      No benchmark history found. Get started by running tests.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          
          {history.length > 0 && (
            <div className="flex justify-end mt-4">
              <button 
                onClick={onNavigateToRun} 
                className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
              >
                Configure Full Run
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
