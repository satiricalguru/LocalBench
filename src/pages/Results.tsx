import { useState, useEffect } from 'react';
import { useSettingsStore } from '../store/settingsStore';
import { useProvidersStore } from '../store/providersStore';
import type { RunWithResults } from '../types';
import { 
  ArrowLeft, Calendar, Clock, Zap, Trophy, 
  Award, Eye, Info, ChevronDown, X, ShieldAlert
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar
} from 'recharts';
import Markdown from 'react-markdown';

interface ResultsProps {
  runId: string | null;
  onBackToHistory: () => void;
}

export default function Results({ runId, onBackToHistory }: ResultsProps) {
  const { weights, customTasks } = useSettingsStore();
  const { models } = useProvidersStore();
  const [runDetails, setRunDetails] = useState<RunWithResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [builtInTasks, setBuiltInTasks] = useState<any[]>([]);

  // Grouped task definitions (merge built-in + custom)
  const allTasks = [...builtInTasks, ...customTasks];

  useEffect(() => {
    window.electronAPI.getBuiltInTasks().then(tasks => {
      setBuiltInTasks(tasks);
    });
  }, []);

  useEffect(() => {
    if (runId) {
      setLoading(true);
      window.electronAPI.getRunDetails(runId).then(details => {
        setRunDetails(details);
        setLoading(false);
      }).catch(err => {
        console.error("Failed to load run details:", err);
        setLoading(false);
      });
    }
  }, [runId]);

  if (loading) {
    return (
      <div className="p-8 text-center text-muted-foreground select-none">
        <Clock className="h-8 w-8 mx-auto animate-spin mb-2" />
        Loading benchmark details...
      </div>
    );
  }

  if (!runDetails) {
    return (
      <div className="p-8 text-center text-muted-foreground select-none">
        <ShieldAlert className="h-8 w-8 mx-auto text-red-500 mb-2" />
        No details found for this run.
      </div>
    );
  }

  const cleanMName = (id: string) => id.split('/').pop()?.split(':')?.[0] ?? id;

  // 1. Calculate composite rankings specifically for this run
  // --------------------------------------------------------
  const modelStats: Record<string, {
    scores: number[];
    tpsVals: number[];
    ttftVals: number[];
    provider: string;
    errorsCount: number;
  }> = {};

  // Group task results by model
  for (const modelId of runDetails.models) {
    modelStats[modelId] = { scores: [], tpsVals: [], ttftVals: [], provider: '', errorsCount: 0 };
  }

  for (const r of runDetails.results) {
    if (r.error) {
      modelStats[r.modelId].errorsCount++;
      continue;
    }
    modelStats[r.modelId].provider = r.provider;
    if (r.score !== null && r.score !== undefined) modelStats[r.modelId].scores.push(r.score);
    if (r.tps !== null && r.tps !== undefined && r.tps > 0) modelStats[r.modelId].tpsVals.push(r.tps);
    if (r.ttft !== null && r.ttft !== undefined && r.ttft > 0) modelStats[r.modelId].ttftVals.push(r.ttft);
  }

  const rows = Object.entries(modelStats).map(([modelId, stats]) => {
    const avgScore = stats.scores.length > 0 ? stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length : 0;
    const avgTps = stats.tpsVals.length > 0 ? stats.tpsVals.reduce((a, b) => a + b, 0) / stats.tpsVals.length : 0;
    const avgTtft = stats.ttftVals.length > 0 ? stats.ttftVals.reduce((a, b) => a + b, 0) / stats.ttftVals.length : 0;

    return {
      modelId,
      name: cleanMName(modelId),
      provider: stats.provider || models.find(m => m.id === modelId)?.provider || 'Ollama',
      avgScore,
      avgTps,
      avgTtft,
      composite: 0
    };
  });

  const maxTps = Math.max(...rows.map(r => r.avgTps), 1);
  const validTtfts = rows.map(r => r.avgTtft).filter(t => t > 0);
  const minTtft = validTtfts.length > 0 ? Math.min(...validTtfts) : 1;

  const rankedModels = rows.map(r => {
    const qualityScore = r.avgScore * 100;
    const speedScore = (r.avgTps / maxTps) * 100;
    const ttftScore = r.avgTtft > 0 ? (minTtft / r.avgTtft) * 100 : 0;

    const composite = (
      qualityScore * (weights.quality / 100) +
      speedScore   * (weights.speed / 100) +
      ttftScore    * (weights.ttft / 100)
    );

    return {
      ...r,
      composite: Math.round(composite * 10) / 10
    };
  }).sort((a, b) => b.composite - a.composite);

  // 2. Identify top models for display cards
  // ----------------------------------------
  const bestModel = rankedModels[0];
  const fastestModel = [...rankedModels].sort((a, b) => b.avgTps - a.avgTps)[0];
  const highestQualityModel = [...rankedModels].sort((a, b) => b.avgScore - a.avgScore)[0];

  // 3. Prepare data for Recharts TPS Speed chart
  // --------------------------------------------
  // Data shape: [ { task: 'Palindrome', 'llama3': 40, 'mistral': 45 } ]
  const speedChartData = runDetails.tasks.map(taskId => {
    const taskName = allTasks.find(t => t.id === taskId)?.name ?? taskId;
    const dataRow: Record<string, any> = { task: taskName.length > 15 ? taskName.slice(0, 15) + '..' : taskName };
    
    for (const modelId of runDetails.models) {
      const result = runDetails.results.find(r => r.modelId === modelId && r.taskId === taskId && !r.error);
      dataRow[cleanMName(modelId)] = result ? result.tps : 0;
    }
    return dataRow;
  });

  // 4. Prepare data for Recharts Radar Category Quality chart
  // ---------------------------------------------------------
  // Categories: speed, reasoning, coding, instruction, context, creative
  const categoryKeys = ['speed', 'reasoning', 'coding', 'instruction', 'context', 'creative'] as const;
  type CategoryKey = typeof categoryKeys[number];
  const categoryNames: Record<CategoryKey, string> = {
    speed: 'Speed',
    reasoning: 'Reasoning',
    coding: 'Coding',
    instruction: 'Instruction',
    context: 'Context',
    creative: 'Creative'
  };

  const radarChartData = categoryKeys.map(cat => {
    const row: Record<string, any> = { subject: categoryNames[cat] };
    for (const modelId of runDetails.models) {
      // Find results in this category
      const resultsInCat = runDetails.results.filter(r => {
        // Resolve task category
        const taskDef = allTasks.find(t => t.id === r.taskId);
        const resolvedCat = taskDef?.category ?? 'speed';
        return r.modelId === modelId && resolvedCat === cat && !r.error;
      });

      const avgInCat = resultsInCat.length > 0
        ? resultsInCat.reduce((acc, curr) => acc + curr.score, 0) / resultsInCat.length
        : 0;

      row[cleanMName(modelId)] = Math.round(avgInCat * 100);
    }
    return row;
  });

  // Provider colors map for chart lines
  const colorsList = ["#8884d8", "#82ca9d", "#ffc658", "#ff7300", "#0088fe", "#00c49f"];

  const getProviderColorClass = (provider: string) => {
    switch (provider) {
      case "Ollama": return "bg-ollama/10 text-ollama border-ollama/20";
      case "LM Studio": return "bg-lmstudio/10 text-lmstudio border-lmstudio/20";
      case "Jan": return "bg-jan/10 text-jan border-jan/20";
      case "GPT4All": return "bg-gpt4all/10 text-gpt4all border-gpt4all/20";
      case "llama.cpp": return "bg-llamacpp/10 text-llamacpp border-llamacpp/20";
      default: return "bg-primary/10 text-primary border-primary/20";
    }
  };

  return (
    <div className="space-y-6 select-none">
      
      {/* Header Back Row */}
      <div className="flex items-center gap-3">
        <button 
          onClick={onBackToHistory}
          className="p-1.5 rounded-lg border border-border bg-card hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Run Results Analysis</h2>
          <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {runDetails.startedAt && !isNaN(new Date(runDetails.startedAt).getTime())
                ? new Date(runDetails.startedAt).toLocaleString()
                : 'Unknown Date'}
            </span>
            <span>Duration: {runDetails.finishedAt && runDetails.startedAt ? formatTime(runDetails.finishedAt - runDetails.startedAt) : 'Incomplete'}</span>
          </div>
        </div>
      </div>

      {/* Top 3 Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Quality Leader */}
        {bestModel && (
          <div className="p-5 rounded-xl bg-card border border-border shadow-sm flex items-center gap-4 border-l-4 border-l-emerald-500">
            <div className="p-3 rounded-lg bg-emerald-500/10 text-emerald-500">
              <Trophy className="h-6 w-6" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Overall Ranking Winner</span>
              <h4 className="text-base font-bold text-foreground truncate max-w-[190px]">{bestModel.name}</h4>
              <span className="text-xs font-semibold text-emerald-500">Composite score: {bestModel.composite}</span>
            </div>
          </div>
        )}

        {/* Speed Winner */}
        {fastestModel && (
          <div className="p-5 rounded-xl bg-card border border-border shadow-sm flex items-center gap-4 border-l-4 border-l-amber-500">
            <div className="p-3 rounded-lg bg-amber-500/10 text-amber-500">
              <Zap className="h-6 w-6" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Fastest Average TPS</span>
              <h4 className="text-base font-bold text-foreground truncate max-w-[190px]">{fastestModel.name}</h4>
              <span className="text-xs font-semibold text-amber-500">{fastestModel.avgTps.toFixed(1)} tokens/sec</span>
            </div>
          </div>
        )}

        {/* Quality Leader */}
        {highestQualityModel && (
          <div className="p-5 rounded-xl bg-card border border-border shadow-sm flex items-center gap-4 border-l-4 border-l-violet-500">
            <div className="p-3 rounded-lg bg-violet-500/10 text-violet-500">
              <Award className="h-6 w-6" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Highest Quality Score</span>
              <h4 className="text-base font-bold text-foreground truncate max-w-[190px]">{highestQualityModel.name}</h4>
              <span className="text-xs font-semibold text-violet-500">{Math.round(highestQualityModel.avgScore * 100)}% accuracy</span>
            </div>
          </div>
        )}
      </div>

      {/* Visualizations Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Speed comparisons bar chart */}
        <div className="p-5 rounded-xl bg-card border border-border shadow-sm">
          <h3 className="text-sm font-bold mb-4 uppercase text-muted-foreground tracking-wider">Generation Speed Comparison (TPS)</h3>
          <div className="h-72 w-full text-xs">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={speedChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                <XAxis dataKey="task" stroke="currentColor" opacity={0.6} />
                <YAxis stroke="currentColor" opacity={0.6} />
                <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', borderColor: '#333', color: '#fff' }} />
                <Legend />
                {runDetails.models.map((modelId, idx) => (
                  <Bar 
                    key={modelId} 
                    dataKey={cleanMName(modelId)} 
                    fill={colorsList[idx % colorsList.length]} 
                    radius={[4, 4, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Radar category quality chart */}
        <div className="p-5 rounded-xl bg-card border border-border shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold mb-4 uppercase text-muted-foreground tracking-wider">Accuracy by Skill Category (%)</h3>
          </div>
          <div className="h-72 w-full text-xs flex justify-center items-center">
            {runDetails.tasks.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarChartData}>
                  <PolarGrid stroke="currentColor" opacity={0.15} />
                  <PolarAngleAxis dataKey="subject" stroke="currentColor" opacity={0.7} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="currentColor" opacity={0.4} />
                  {runDetails.models.map((modelId, idx) => (
                    <Radar
                      key={modelId}
                      name={cleanMName(modelId)}
                      dataKey={cleanMName(modelId)}
                      stroke={colorsList[idx % colorsList.length]}
                      fill={colorsList[idx % colorsList.length]}
                      fillOpacity={0.15}
                    />
                  ))}
                  <Legend />
                </RadarChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-muted-foreground text-xs text-center py-16 flex flex-col items-center gap-1">
                <Info className="h-8 w-8 opacity-30" />
                <span>Radar chart requires tasks across multiple categories.</span>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Leaderboard comparisons for this run */}
      <div className="p-5 rounded-xl bg-card border border-border shadow-sm">
        <h3 className="text-sm font-bold mb-3 uppercase text-muted-foreground tracking-wider">Run Leaderboard Rankings</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border text-muted-foreground font-semibold">
                <th className="py-2.5 w-16 text-center">Rank</th>
                <th className="py-2.5">Model ID</th>
                <th className="py-2.5">Provider</th>
                <th className="py-2.5 text-right">Composite</th>
                <th className="py-2.5 text-right">Avg TPS</th>
                <th className="py-2.5 text-right">Avg TTFT</th>
                <th className="py-2.5 text-right">Avg Quality</th>
                <th className="py-2.5 text-right">Errors</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {rankedModels.map((row, idx) => {
                const rank = idx + 1;
                const errCount = modelStats[row.modelId].errorsCount;
                return (
                  <tr key={row.modelId} className="hover:bg-secondary/20 transition-colors">
                    <td className="py-3 text-center">
                      <span className={`inline-flex items-center justify-center h-6 w-6 rounded-full text-xs font-bold leading-none ${rank === 1 ? 'bg-amber-500/10 text-amber-500' : 'bg-secondary text-muted-foreground'}`}>
                        {rank}
                      </span>
                    </td>
                    <td className="py-3 font-semibold text-foreground">{row.name}</td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded border text-[9px] font-bold uppercase ${getProviderColorClass(row.provider)}`}>
                        {row.provider}
                      </span>
                    </td>
                    <td className="py-3 text-right font-bold text-foreground">{row.composite}</td>
                    <td className="py-3 text-right font-bold text-foreground">{row.avgTps > 0 ? row.avgTps.toFixed(1) : 'N/A'}</td>
                    <td className="py-3 text-right text-foreground">{row.avgTtft > 0 ? `${Math.round(row.avgTtft)} ms` : 'N/A'}</td>
                    <td className="py-3 text-right font-bold text-emerald-500">{Math.round(row.avgScore * 100)}%</td>
                    <td className="py-3 text-right">
                      {errCount > 0 ? (
                        <span className="font-bold text-red-500">{errCount} fail</span>
                      ) : (
                        <span className="text-muted-foreground/60">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Task Matrix grid details */}
      <div className="p-5 rounded-xl bg-card border border-border shadow-sm">
        <h3 className="text-sm font-bold mb-3.5 uppercase text-muted-foreground tracking-wider font-semibold">Evaluation Tasks Matrix</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border text-muted-foreground font-semibold">
                <th className="py-2.5">Task Description</th>
                <th className="py-2.5">Category</th>
                {runDetails.models.map(mId => (
                  <th key={mId} className="py-2.5 text-right w-36 font-semibold">{cleanMName(mId)}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {runDetails.tasks.map(taskId => {
                const taskDef = allTasks.find(t => t.id === taskId);
                const taskName = taskDef?.name ?? taskId;
                const taskCat = taskDef?.category ?? 'speed';
                
                return (
                  <tr key={taskId} className="hover:bg-secondary/20 transition-colors">
                    <td className="py-3 font-semibold text-foreground">{taskName}</td>
                    <td className="py-3">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground bg-secondary/80 px-2 py-0.5 rounded">
                        {taskCat}
                      </span>
                    </td>
                    {runDetails.models.map(modelId => {
                      const result = runDetails.results.find(r => r.modelId === modelId && r.taskId === taskId);
                      if (!result) return <td key={modelId} className="py-3 text-right text-muted-foreground/40 font-medium">Pending</td>;
                      if (result.error) return <td key={modelId} className="py-3 text-right text-red-500 font-bold" title={result.error}>{result.error}</td>;
                      
                      return (
                        <td key={modelId} className="py-3 text-right">
                          <div className="flex flex-col items-end">
                            <span className="font-bold text-emerald-500">{Math.round(result.score * 100)}%</span>
                            <span className="text-[10px] text-muted-foreground">{result.tps.toFixed(1)} TPS / {Math.round(result.ttft)}ms TTFT</span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Raw Prompts & Responses Accordion block */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold uppercase text-muted-foreground tracking-wider font-semibold">Raw Prompt Responses Inspector</h3>

        <div className="space-y-3">
          {runDetails.tasks.map(taskId => {
            const taskDef = allTasks.find(t => t.id === taskId);
            
            return (
              <details key={taskId} className="group border border-border bg-card rounded-xl overflow-hidden shadow-sm">
                <summary className="p-4 flex items-center justify-between font-semibold text-xs cursor-pointer select-none hover:bg-secondary/30 list-none [&::-webkit-details-marker]:hidden">
                  <div className="flex items-center gap-3">
                    <Eye className="h-4 w-4 text-primary shrink-0" />
                    <div>
                      <span className="font-bold text-foreground text-sm">{taskDef?.name ?? taskId}</span>
                      <span className="text-[10px] text-muted-foreground block font-mono mt-0.5">{taskDef?.prompt.slice(0, 70)}...</span>
                    </div>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180 shrink-0" />
                </summary>
                
                <div className="p-4 border-t border-border bg-secondary/15 space-y-4 text-xs">
                  {/* Task Prompt block */}
                  <div className="p-3 bg-card border border-border/80 rounded-lg">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">Standard Evaluator Prompt</span>
                    <pre className="font-mono text-foreground whitespace-pre-wrap leading-relaxed select-text">{taskDef?.prompt}</pre>
                  </div>

                  {/* Responses side by side or vertical */}
                  <div className="space-y-3">
                    {runDetails.models.map(modelId => {
                      const result = runDetails.results.find(r => r.modelId === modelId && r.taskId === taskId);
                      return (
                        <div key={modelId} className="p-3.5 bg-card border border-border/80 rounded-lg space-y-2 relative">
                          <div className="flex justify-between items-center border-b border-border/40 pb-1.5 mb-1.5">
                            <span className="font-bold text-foreground text-xs leading-none">
                              {cleanMName(modelId)}
                            </span>
                            <span className="text-[9px] uppercase font-bold text-muted-foreground">
                              {result ? `${result.provider}` : 'No result'}
                            </span>
                          </div>

                          {/* Result details if any */}
                          {result ? (
                            result.error ? (
                              <div className="text-red-500 font-semibold flex items-center gap-1.5">
                                <X className="h-4 w-4" />
                                Run Error: {result.error}
                              </div>
                            ) : (
                              <div className="space-y-3 select-text">
                                {/* Score stats tags */}
                                <div className="flex gap-4 text-[10px] font-semibold text-muted-foreground">
                                  <span>Score: <strong className="text-emerald-500">{Math.round(result.score * 100)}%</strong></span>
                                  <span>TPS: <strong className="text-foreground">{result.tps.toFixed(1)}</strong></span>
                                  <span>TTFT: <strong className="text-foreground">{Math.round(result.ttft)}ms</strong></span>
                                  <span>Latency: <strong className="text-foreground">{formatTime(result.totalLatency)}</strong></span>
                                </div>
                                
                                {/* Response content */}
                                <div className="markdown-body text-foreground bg-secondary/25 p-3 rounded border border-border/50 max-h-64 overflow-y-auto text-xs leading-relaxed">
                                  <Markdown>{result.rawResponse}</Markdown>
                                </div>
                              </div>
                            )
                          ) : (
                            <span className="text-muted-foreground/60">No task logs written.</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      </div>

    </div>
  );
}

function formatTime(ms: number) {
  if (ms <= 0) return '0s';
  const totalSecs = Math.round(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}
