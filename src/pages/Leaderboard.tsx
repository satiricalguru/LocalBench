import { useState, useEffect } from 'react';
import { useSettingsStore } from '../store/settingsStore';
import { useProvidersStore } from '../store/providersStore';
import { Trophy, ShieldAlert, Download, ArrowUpDown } from 'lucide-react';

interface LeaderboardProps {
  onNavigateToResults: (runId: string) => void;
}

interface LeaderboardRow {
  modelId: string;
  name: string;
  provider: string;
  family: string;
  avgScore: number;       // 0 - 1
  avgTps: number;
  avgTtft: number;
  composite: number;      // 0 - 100
  lastRunId: string;
  runCount: number;
}

export default function Leaderboard({ onNavigateToResults }: LeaderboardProps) {
  const { weights } = useSettingsStore();
  const { models } = useProvidersStore();

  const [leaderboardData, setLeaderboardData] = useState<LeaderboardRow[]>([]);
  const [filterProvider, setFilterProvider] = useState<string>('all');
  const [filterFamily, setFilterFamily] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'composite' | 'tps' | 'ttft' | 'quality'>('composite');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const fetchHistoryAndCompile = async () => {
    try {
      const runs = await window.electronAPI.getRunHistory();
      const modelStatsMap = new Map<string, {
        scores: number[];
        tpsVals: number[];
        ttftVals: number[];
        lastRunId: string;
        runIds: Set<string>;
      }>();

      for (const r of runs) {
        const details = await window.electronAPI.getRunDetails(r.id);
        if (details && details.results) {
          for (const res of details.results) {
            if (res.error) continue; // ignore timeouts / unreachable errors for metric calculation
            
            let stats = modelStatsMap.get(res.modelId);
            if (!stats) {
              stats = { scores: [], tpsVals: [], ttftVals: [], lastRunId: r.id, runIds: new Set() };
              modelStatsMap.set(res.modelId, stats);
            }
            stats.runIds.add(r.id);
            if (res.score !== null && res.score !== undefined) stats.scores.push(res.score);
            if (res.tps !== null && res.tps !== undefined && res.tps > 0) stats.tpsVals.push(res.tps);
            if (res.ttft !== null && res.ttft !== undefined && res.ttft > 0) stats.ttftVals.push(res.ttft);
          }
        }
      }

      // Compile rows
      const rows: LeaderboardRow[] = [];
      
      modelStatsMap.forEach((stats, modelId) => {
        const avgScore = stats.scores.length > 0 ? stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length : 0;
        const avgTps = stats.tpsVals.length > 0 ? stats.tpsVals.reduce((a, b) => a + b, 0) / stats.tpsVals.length : 0;
        const avgTtft = stats.ttftVals.length > 0 ? stats.ttftVals.reduce((a, b) => a + b, 0) / stats.ttftVals.length : 0;

        // Find metadata from provider models cache
        const cacheMatch = models.find(m => m.id === modelId);
        const name = cacheMatch?.name ?? modelId.split('/').pop() ?? modelId;
        const provider = cacheMatch?.provider ?? 'Ollama';
        const family = cacheMatch?.family ?? 'other';

        rows.push({
          modelId,
          name,
          provider,
          family,
          avgScore,
          avgTps,
          avgTtft,
          composite: 0, // calculated next
          lastRunId: stats.lastRunId,
          runCount: stats.runIds.size
        });
      });

      if (rows.length === 0) {
        setLeaderboardData([]);
        return;
      }

      // Normalize TPS and TTFT relative to boundaries
      const maxTps = Math.max(...rows.map(r => r.avgTps), 1);
      const validTtfts = rows.map(r => r.avgTtft).filter(t => t > 0);
      const minTtft = validTtfts.length > 0 ? Math.min(...validTtfts) : 1;

      const compiledRows = rows.map(r => {
        const qualityScore = r.avgScore * 100;
        
        // speedScore relative to fastest model (0-100)
        const speedScore = (r.avgTps / maxTps) * 100;
        
        // ttftScore inverted: lower is better (0-100). Min TTFT gets 100, others scaled.
        const ttftScore = r.avgTtft > 0 ? (minTtft / r.avgTtft) * 100 : 0;

        // composite Score formula
        const composite = (
          qualityScore * (weights.quality / 100) +
          speedScore   * (weights.speed / 100) +
          ttftScore    * (weights.ttft / 100)
        );

        return {
          ...r,
          composite: Math.round(composite * 10) / 10
        };
      });

      setLeaderboardData(compiledRows);
    } catch (err) {
      console.error("Failed to compile leaderboard:", err);
    }
  };

  useEffect(() => {
    fetchHistoryAndCompile();
  }, [models, weights]);

  // Unique lists for filtering options
  const providersList = Array.from(new Set(leaderboardData.map(r => r.provider)));
  const familiesList = Array.from(new Set(leaderboardData.map(r => r.family)));

  // Filter & Sort
  const filteredData = leaderboardData
    .filter(r => filterProvider === 'all' || r.provider === filterProvider)
    .filter(r => filterFamily === 'all' || r.family === filterFamily)
    .sort((a, b) => {
      let valA = 0;
      let valB = 0;

      if (sortBy === 'composite') { valA = a.composite; valB = b.composite; }
      else if (sortBy === 'tps') { valA = a.avgTps; valB = b.avgTps; }
      else if (sortBy === 'ttft') { valA = a.avgTtft; valB = b.avgTtft; }
      else if (sortBy === 'quality') { valA = a.avgScore; valB = b.avgScore; }

      // Adjust order
      if (sortOrder === 'asc') {
        // for TTFT, lower is better, but sorting ASC is already lower first
        return valA > valB ? 1 : -1;
      } else {
        return valA < valB ? 1 : -1;
      }
    });

  const toggleSort = (field: typeof sortBy) => {
    if (sortBy === field) {
      setOrderToggle();
    } else {
      setSortBy(field);
      // TTFT defaults to ASC (lower first), others DESC
      setSortOrder(field === 'ttft' ? 'asc' : 'desc');
    }
  };

  const setOrderToggle = () => {
    setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
  };

  const handleExportCSV = () => {
    const csvHeaders = ['Rank', 'Model Name', 'Provider', 'Family', 'Composite Score', 'Avg TPS', 'Avg TTFT (ms)', 'Avg Quality (%)', 'Test Runs'];
    let csvContent = csvHeaders.join(',') + '\n';

    filteredData.forEach((row, i) => {
      const csvRow = [
        i + 1,
        `"${row.name}"`,
        `"${row.provider}"`,
        `"${row.family}"`,
        row.composite,
        row.avgTps.toFixed(1),
        row.avgTtft.toFixed(0),
        `${Math.round(row.avgScore * 100)}%`,
        row.runCount
      ];
      csvContent += csvRow.join(',') + '\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `localbench_leaderboard_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getRankBadge = (rank: number) => {
    if (rank === 1) return "bg-amber-500/10 text-amber-500 border border-amber-500/20";
    if (rank === 2) return "bg-slate-400/10 text-slate-400 border border-slate-400/20";
    if (rank === 3) return "bg-amber-700/10 text-amber-700 border border-amber-700/20";
    return "bg-secondary text-muted-foreground";
  };

  const getProviderTagColor = (provider: string) => {
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
    <div className="space-y-6">
      
      {/* Title block */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Model Leaderboard</h2>
          <p className="text-sm text-muted-foreground">Ranked comparison of discovered local models.</p>
        </div>
        
        {filteredData.length > 0 && (
          <button 
            onClick={handleExportCSV}
            className="btn-secondary h-9 flex items-center gap-1.5 text-xs"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        )}
      </div>

      {/* Filter strip */}
      <div className="p-4 rounded-xl bg-card border border-border shadow-sm flex flex-wrap gap-4 items-center justify-between">
        
        <div className="flex flex-wrap gap-4 text-xs">
          
          {/* Provider */}
          <div className="space-y-1">
            <span className="text-muted-foreground font-semibold block">Provider Filter</span>
            <select
              value={filterProvider}
              onChange={(e) => setFilterProvider(e.target.value)}
              className="form-input text-xs h-8 py-0 min-h-8"
            >
              <option value="all">All Providers</option>
              {providersList.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {/* Model Family */}
          <div className="space-y-1">
            <span className="text-muted-foreground font-semibold block">Family Filter</span>
            <select
              value={filterFamily}
              onChange={(e) => setFilterFamily(e.target.value)}
              className="form-input text-xs h-8 py-0 min-h-8"
            >
              <option value="all">All Families</option>
              {familiesList.map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>

        </div>

        {/* Weights overview tag */}
        <div className="text-[11px] font-semibold text-muted-foreground bg-secondary/60 px-3 py-1.5 rounded-lg border border-border">
          Weights Applied: Quality {weights.quality}% | Speed {weights.speed}% | TTFT {weights.ttft}%
        </div>
      </div>

      {/* Leaderboard rankings table */}
      <div className="p-5 rounded-xl bg-card border border-border shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border text-muted-foreground font-semibold">
                <th className="py-3 px-2 w-16 text-center">Rank</th>
                <th className="py-3 px-2">Model ID</th>
                <th className="py-3 px-2 w-28">Provider</th>
                
                {/* Composite Sortable */}
                <th className="py-3 px-2 w-44">
                  <button 
                    onClick={() => toggleSort('composite')}
                    className="flex items-center gap-1 hover:text-foreground font-semibold uppercase tracking-wider"
                  >
                    Composite
                    <ArrowUpDown className="h-3.5 w-3.5 shrink-0" />
                  </button>
                </th>
                
                {/* TPS Sortable */}
                <th className="py-3 px-2 w-28 text-right">
                  <button 
                    onClick={() => toggleSort('tps')}
                    className="ml-auto flex items-center gap-1 hover:text-foreground font-semibold uppercase tracking-wider"
                  >
                    TPS
                    <ArrowUpDown className="h-3.5 w-3.5 shrink-0" />
                  </button>
                </th>
                
                {/* TTFT Sortable */}
                <th className="py-3 px-2 w-28 text-right">
                  <button 
                    onClick={() => toggleSort('ttft')}
                    className="ml-auto flex items-center gap-1 hover:text-foreground font-semibold uppercase tracking-wider"
                  >
                    TTFT
                    <ArrowUpDown className="h-3.5 w-3.5 shrink-0" />
                  </button>
                </th>

                {/* Quality Sortable */}
                <th className="py-3 px-2 w-28 text-right">
                  <button 
                    onClick={() => toggleSort('quality')}
                    className="ml-auto flex items-center gap-1 hover:text-foreground font-semibold uppercase tracking-wider"
                  >
                    Quality
                    <ArrowUpDown className="h-3.5 w-3.5 shrink-0" />
                  </button>
                </th>

                <th className="py-3 px-2 w-28 text-right">Runs</th>
                <th className="py-3 px-2 w-24 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filteredData.map((row, idx) => {
                const rank = idx + 1;
                return (
                  <tr key={row.modelId} className="hover:bg-secondary/20 transition-colors">
                    
                    {/* Rank Badge */}
                    <td className="py-3 px-2 text-center">
                      <span className={`inline-flex items-center justify-center h-6 w-6 rounded-full text-xs font-bold leading-none ${getRankBadge(rank)}`}>
                        {rank}
                      </span>
                    </td>

                    {/* Model Details */}
                    <td className="py-3 px-2 font-medium">
                      <div>
                        <span className="font-semibold block text-foreground leading-snug">{row.name}</span>
                        <code className="text-[9px] text-muted-foreground block font-mono truncate max-w-[280px]" title={row.modelId}>
                          {row.modelId}
                        </code>
                      </div>
                    </td>

                    {/* Provider Tag */}
                    <td className="py-3 px-2">
                      <span className={`px-2 py-0.5 rounded border text-[9px] font-bold uppercase ${getProviderTagColor(row.provider)}`}>
                        {row.provider}
                      </span>
                    </td>

                    {/* Composite horizontal bar */}
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-2.5">
                        <span className="font-bold text-foreground text-sm shrink-0 w-8">
                          {row.composite}
                        </span>
                        <div className="h-2 w-full max-w-[120px] bg-secondary rounded-full overflow-hidden shrink-0 border border-border">
                          <div 
                            className="h-full bg-primary rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(100, Math.max(0, row.composite))}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    {/* TPS */}
                    <td className="py-3 px-2 text-right font-bold text-foreground">
                      {row.avgTps > 0 ? `${row.avgTps.toFixed(1)}` : 'N/A'}
                    </td>

                    {/* TTFT */}
                    <td className="py-3 px-2 text-right font-medium text-foreground">
                      {row.avgTtft > 0 ? `${Math.round(row.avgTtft)} ms` : 'N/A'}
                    </td>

                    {/* Quality */}
                    <td className="py-3 px-2 text-right font-bold text-emerald-500">
                      {Math.round(row.avgScore * 100)}%
                    </td>

                    {/* Run count */}
                    <td className="py-3 px-2 text-right font-medium text-muted-foreground">
                      {row.runCount}
                    </td>

                    {/* Action */}
                    <td className="py-3 px-2 text-right">
                      <button
                        onClick={() => onNavigateToResults(row.lastRunId)}
                        className="text-primary hover:underline font-semibold"
                      >
                        Last Run
                      </button>
                    </td>

                  </tr>
                );
              })}

              {filteredData.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-muted-foreground font-medium">
                    <Trophy className="h-10 w-10 mx-auto opacity-30 mb-2" />
                    No models registered in the global leaderboard. Run a benchmark task to populate statistics.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Settings warning */}
      {leaderboardData.length > 0 && (
        <div className="p-3.5 rounded-lg border border-border/80 bg-secondary/20 text-muted-foreground text-xs flex items-start gap-2.5">
          <ShieldAlert className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          <span>
            The leaderboard dynamically compiles metrics across all historical test logs in your database. 
            Scores are normalized where the fastest model sets the reference boundaries (100% speed score relative to highest TPS and lowest TTFT). 
            Adjust parameter weights in the Settings tab to change how columns composite into the main Rank.
          </span>
        </div>
      )}

    </div>
  );
}
