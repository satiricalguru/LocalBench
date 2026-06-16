import { useState, useEffect } from 'react';
import { useProvidersStore } from '../store/providersStore';
import { Scale, Plus, X, Cpu, Globe, HelpCircle, Check, AlertTriangle, ArrowUpRight, DollarSign, Activity, Award, Zap } from 'lucide-react';

interface ModelComparisonData {
  id: string;
  name: string;
  provider: string;
  type: 'Local' | 'Cloud';
  parameterSize: string;
  contextLength: number;
  inputPrice: number; // per 1M tokens
  outputPrice: number; // per 1M tokens
  modalities: string;
  description: string;
  // Local benchmark stats (if available)
  avgScore?: number;
  avgTps?: number;
  avgTtft?: number;
  runCount?: number;
}

interface OpenRouterModel {
  id: string;
  name: string;
  description: string;
  context_length: number;
  pricing: {
    prompt: string;
    completion: string;
  };
  architecture?: {
    modality?: string;
    tokenizer?: string;
  };
}

const POPULAR_CLOUD_MODELS: OpenRouterModel[] = [
  {
    id: "openai/gpt-4o",
    name: "OpenAI: GPT-4o",
    description: "OpenAI's flagship multimodal model, highly capable, versatile, and fast.",
    context_length: 128000,
    pricing: { prompt: "0.000005", completion: "0.000015" }, // $5.00 / $15.00
    architecture: { modality: "text+image->text" }
  },
  {
    id: "anthropic/claude-3.5-sonnet",
    name: "Anthropic: Claude 3.5 Sonnet",
    description: "Most intelligent model from Anthropic, highest coding, reasoning, and agents capabilities.",
    context_length: 200000,
    pricing: { prompt: "0.000003", completion: "0.000015" }, // $3.00 / $15.00
    architecture: { modality: "text+image->text" }
  },
  {
    id: "google/gemini-pro-1.5",
    name: "Google: Gemini 1.5 Pro",
    description: "Google's flagship model with a massive 1 million token context window and native multimodality.",
    context_length: 1000000,
    pricing: { prompt: "0.000007", completion: "0.000021" },
    architecture: { modality: "text+image->text" }
  },
  {
    id: "meta-llama/llama-3.1-70b-instruct",
    name: "Meta: Llama 3.1 70B",
    description: "Meta's highly capable open weights model hosted on cloud routers. Strong reasoning and general performance.",
    context_length: 131072,
    pricing: { prompt: "0.0000007", completion: "0.0000009" },
    architecture: { modality: "text->text" }
  },
  {
    id: "deepseek/deepseek-chat",
    name: "DeepSeek V3 (Cloud)",
    description: "High-performance Mixture of Experts model from DeepSeek. Highly competitive with frontier models at extremely low pricing.",
    context_length: 64000,
    pricing: { prompt: "0.00000014", completion: "0.00000028" }, // $0.14 / $0.28
    architecture: { modality: "text->text" }
  }
];

export default function Compare() {
  const { models } = useProvidersStore();
  const [openRouterModels, setOpenRouterModels] = useState<OpenRouterModel[]>(POPULAR_CLOUD_MODELS);
  const [selectedModels, setSelectedModels] = useState<ModelComparisonData[]>([]);
  const [localStats, setLocalStats] = useState<Record<string, { avgScore: number; avgTps: number; avgTtft: number; runCount: number }>>({});
  const [searchModel, setSearchModel] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Fetch OpenRouter models and local database stats on mount
  useEffect(() => {
    const fetchCloudModels = async () => {
      try {
        const res = await fetch('https://openrouter.ai/api/v1/models');
        const json = await res.json();
        if (json && json.data && Array.isArray(json.data) && json.data.length > 0) {
          setOpenRouterModels(json.data);
        }
      } catch (err) {
        console.warn("Could not fetch OpenRouter models live, falling back to static popular list", err);
      }
    };

    const fetchLocalStats = async () => {
      try {
        const runs = await window.electronAPI.getRunHistory();
        const tempStats: Record<string, { scores: number[]; tpsVals: number[]; ttftVals: number[]; runIds: Set<string> }> = {};

        for (const r of runs) {
          const details = await window.electronAPI.getRunDetails(r.id);
          if (details && details.results) {
            for (const res of details.results) {
              if (res.error) continue;
              if (!tempStats[res.modelId]) {
                tempStats[res.modelId] = { scores: [], tpsVals: [], ttftVals: [], runIds: new Set() };
              }
              tempStats[res.modelId].runIds.add(r.id);
              if (res.score !== null && res.score !== undefined) tempStats[res.modelId].scores.push(res.score);
              if (res.tps !== null && res.tps !== undefined && res.tps > 0) tempStats[res.modelId].tpsVals.push(res.tps);
              if (res.ttft !== null && res.ttft !== undefined && res.ttft > 0) tempStats[res.modelId].ttftVals.push(res.ttft);
            }
          }
        }

        const compiledStats: Record<string, { avgScore: number; avgTps: number; avgTtft: number; runCount: number }> = {};
        Object.keys(tempStats).forEach(modelId => {
          const s = tempStats[modelId];
          compiledStats[modelId] = {
            avgScore: s.scores.length > 0 ? s.scores.reduce((a, b) => a + b, 0) / s.scores.length : 0,
            avgTps: s.tpsVals.length > 0 ? s.tpsVals.reduce((a, b) => a + b, 0) / s.tpsVals.length : 0,
            avgTtft: s.ttftVals.length > 0 ? s.ttftVals.reduce((a, b) => a + b, 0) / s.ttftVals.length : 0,
            runCount: s.runIds.size
          };
        });
        setLocalStats(compiledStats);
      } catch (err) {
        console.error("Failed to load local stats for comparison:", err);
      }
    };

    fetchCloudModels();
    fetchLocalStats();
  }, [models]);



  const convertLocalToCompare = (local: typeof models[0]): ModelComparisonData => {
    // Estimate parameters and memory needed
    const paramMatch = local.id.match(/(\d+(?:\.\d+)?)[bB]/);
    const parameterSize = paramMatch ? `${paramMatch[1].toUpperCase()}B` : 'Unknown';
    const stats = localStats[local.id];
    
    // Heuristic context length for some common local families
    let contextLength = 8192;
    if (local.id.includes('llama3.1') || local.id.includes('llama3.3')) contextLength = 131072;
    else if (local.id.includes('llama3.2')) contextLength = 131072;
    else if (local.id.includes('qwen2.5')) contextLength = 128000;
    else if (local.id.includes('phi3')) contextLength = 128000;
    else if (local.id.includes('phi4')) contextLength = 16384;

    return {
      id: local.id,
      name: local.name,
      provider: local.provider,
      type: 'Local',
      parameterSize,
      contextLength,
      inputPrice: 0,
      outputPrice: 0,
      modalities: local.id.includes('vision') || local.id.includes('llava') ? 'text+image->text' : 'text->text',
      description: `Locally hosted model using ${local.provider}. Running directly on your hardware.`,
      avgScore: stats?.avgScore,
      avgTps: stats?.avgTps,
      avgTtft: stats?.avgTtft,
      runCount: stats?.runCount
    };
  };

  const convertCloudToCompare = (cloud: OpenRouterModel): ModelComparisonData => {
    // Parse parameter size if possible from description/id
    const paramMatch = cloud.id.match(/(\d+(?:\.\d+)?)[bB]/) || cloud.description.match(/(\d+(?:\.\d+)?)[bB]/);
    const parameterSize = paramMatch ? `${paramMatch[1].toUpperCase()}B` : 'Varies';

    return {
      id: cloud.id,
      name: cloud.name,
      provider: 'OpenRouter',
      type: 'Cloud',
      parameterSize,
      contextLength: cloud.context_length,
      inputPrice: parseFloat(cloud.pricing.prompt) * 1000000,
      outputPrice: parseFloat(cloud.pricing.completion) * 1000000,
      modalities: cloud.architecture?.modality || 'text->text',
      description: cloud.description
    };
  };

  const addModel = (model: ModelComparisonData) => {
    if (selectedModels.some(m => m.id === model.id)) return;
    setSelectedModels([...selectedModels, model]);
    setDropdownOpen(false);
    setSearchModel('');
  };

  const removeModel = (id: string) => {
    setSelectedModels(selectedModels.filter(m => m.id !== id));
  };

  const loadPreset = (preset: string) => {
    const newSelections: ModelComparisonData[] = [];
    if (preset === 'r1-vs-v3') {
      const localR1 = models.find(m => m.id.toLowerCase().includes('r1')) || models.find(m => m.id.toLowerCase().includes('llama'));
      const cloudV3 = openRouterModels.find(m => m.id.includes('deepseek/deepseek-chat'));
      if (localR1) newSelections.push(convertLocalToCompare(localR1));
      if (cloudV3) newSelections.push(convertCloudToCompare(cloudV3));
    } else if (preset === 'local-vs-gpt4') {
      const localLlama = models.find(m => m.id.toLowerCase().includes('llama3.1:8b') || m.id.toLowerCase().includes('llama3')) || models[0];
      const gpt4o = openRouterModels.find(m => m.id === 'openai/gpt-4o');
      const sonnet = openRouterModels.find(m => m.id === 'anthropic/claude-3.5-sonnet');
      if (localLlama) newSelections.push(convertLocalToCompare(localLlama));
      if (gpt4o) newSelections.push(convertCloudToCompare(gpt4o));
      if (sonnet) newSelections.push(convertCloudToCompare(sonnet));
    } else if (preset === 'speed-showdown') {
      const localSpeed = models.find(m => m.id.toLowerCase().includes('gemma2:2b') || m.id.toLowerCase().includes('llama3.2:1b')) || models[0];
      const cloudSpeed = openRouterModels.find(m => m.id.includes('google/gemini-flash') || m.id.includes('meta-llama/llama-3.1-8b-instruct'));
      if (localSpeed) newSelections.push(convertLocalToCompare(localSpeed));
      if (cloudSpeed) newSelections.push(convertCloudToCompare(cloudSpeed));
    }
    if (newSelections.length > 0) {
      setSelectedModels(newSelections);
    }
  };

  // Filter list of addable models
  const searchLower = searchModel.toLowerCase();
  
  const selectableLocal = models
    .filter(m => m.name.toLowerCase().includes(searchLower) || m.id.toLowerCase().includes(searchLower))
    .map(m => convertLocalToCompare(m));

  const selectableCloud = openRouterModels
    .filter(m => m.name.toLowerCase().includes(searchLower) || m.id.toLowerCase().includes(searchLower))
    .map(m => convertCloudToCompare(m));

  return (
    <div className="space-y-6 select-none relative">
      {/* Title */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Scale className="h-6 w-6 text-primary" />
          Model Compare
        </h2>
        <p className="text-sm text-muted-foreground">Compare local offline models against cloud API offerings side-by-side.</p>
      </div>

      {/* Preset Quick Actions */}
      <div className="flex flex-wrap gap-2.5 items-center">
        <span className="text-xs font-semibold text-muted-foreground">Quick Presets:</span>
        <button 
          onClick={() => loadPreset('local-vs-gpt4')} 
          className="btn-secondary text-[11px] h-8 px-3 rounded-lg flex items-center gap-1.5"
        >
          <Cpu className="h-3.5 w-3.5" /> vs GPT-4o / Claude 3.5
        </button>
        <button 
          onClick={() => loadPreset('r1-vs-v3')} 
          className="btn-secondary text-[11px] h-8 px-3 rounded-lg flex items-center gap-1.5"
        >
          <Activity className="h-3.5 w-3.5" /> DeepSeek R1 vs V3
        </button>
        <button 
          onClick={() => loadPreset('speed-showdown')} 
          className="btn-secondary text-[11px] h-8 px-3 rounded-lg flex items-center gap-1.5"
        >
          <Zap className="h-3.5 w-3.5" /> Speed Showdown
        </button>
      </div>

      {/* Model Selector and Add Button */}
      <div className="flex justify-between items-center bg-card p-4 rounded-xl border border-border">
        <div className="relative">
          <button 
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="btn-primary h-9 text-xs px-4 flex items-center gap-2"
          >
            <Plus className="h-4 w-4" /> Add Model to Compare
          </button>
          
          {dropdownOpen && (
            <div className="absolute left-0 mt-2 w-80 bg-card text-card-foreground rounded-xl border border-border shadow-2xl z-50 overflow-hidden max-h-96 flex flex-col">
              <div className="p-2 border-b border-border">
                <input 
                  type="text" 
                  autoFocus
                  placeholder="Search model name..." 
                  value={searchModel}
                  onChange={(e) => setSearchModel(e.target.value)}
                  className="w-full bg-secondary/50 border border-border text-xs px-3 py-1.5 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="overflow-y-auto divide-y divide-border/60">
                {selectableLocal.length > 0 && (
                  <div>
                    <div className="bg-secondary/40 text-[10px] font-bold uppercase tracking-wider px-3 py-1 text-muted-foreground">Local Models</div>
                    {selectableLocal.map(m => (
                      <button
                        key={m.id}
                        onClick={() => addModel(m)}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-secondary flex justify-between items-center group"
                      >
                        <span className="font-medium truncate max-w-[200px] group-hover:text-primary">{m.name}</span>
                        <span className="text-[9px] text-muted-foreground uppercase font-bold bg-secondary/80 px-1.5 py-0.5 rounded border border-border">{m.provider}</span>
                      </button>
                    ))}
                  </div>
                )}
                {selectableCloud.length > 0 && (
                  <div>
                    <div className="bg-secondary/40 text-[10px] font-bold uppercase tracking-wider px-3 py-1 text-muted-foreground">Cloud Models (OpenRouter)</div>
                    {selectableCloud.map(m => (
                      <button
                        key={m.id}
                        onClick={() => addModel(m)}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-secondary flex justify-between items-center group"
                      >
                        <span className="font-medium truncate max-w-[200px] group-hover:text-primary">{m.name}</span>
                        <span className="text-[9px] text-emerald-500 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">${m.inputPrice.toFixed(2)}/M</span>
                      </button>
                    ))}
                  </div>
                )}
                {selectableLocal.length === 0 && selectableCloud.length === 0 && (
                  <div className="p-4 text-center text-xs text-muted-foreground">No models found</div>
                )}
              </div>
            </div>
          )}
        </div>
        
        <span className="text-xs text-muted-foreground font-semibold">
          {selectedModels.length} models selected
        </span>
      </div>

      {/* Comparison Grid Table */}
      {selectedModels.length > 0 ? (
        <div className="p-5 rounded-xl bg-card border border-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-3 px-4 w-48 text-muted-foreground font-bold uppercase tracking-wider">Features</th>
                  {selectedModels.map(m => (
                    <th key={m.id} className="py-3 px-4 min-w-[220px] max-w-[280px]">
                      <div className="flex flex-col gap-1 relative pr-6">
                        <button 
                          onClick={() => removeModel(m.id)}
                          className="absolute right-0 top-0 p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary"
                          title="Remove from comparison"
                        >
                          <X className="h-4 w-4" />
                        </button>
                        <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded border w-fit ${
                          m.type === 'Local' 
                            ? 'bg-primary/10 text-primary border-primary/20' 
                            : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                        }`}>
                          {m.type}
                        </span>
                        <span className="font-bold text-foreground text-sm leading-snug line-clamp-1">{m.name}</span>
                        <code className="text-[9px] text-muted-foreground font-mono truncate">{m.id}</code>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {/* Provider */}
                <tr>
                  <td className="py-4 px-4 font-bold text-muted-foreground uppercase tracking-wider">Host/Provider</td>
                  {selectedModels.map(m => (
                    <td key={m.id} className="py-4 px-4 font-medium text-foreground">
                      {m.provider}
                    </td>
                  ))}
                </tr>
                {/* Parameter Size */}
                <tr>
                  <td className="py-4 px-4 font-bold text-muted-foreground uppercase tracking-wider">Parameters</td>
                  {selectedModels.map(m => (
                    <td key={m.id} className="py-4 px-4 font-semibold text-foreground">
                      {m.parameterSize}
                    </td>
                  ))}
                </tr>
                {/* Context Length */}
                <tr>
                  <td className="py-4 px-4 font-bold text-muted-foreground uppercase tracking-wider">Context Window</td>
                  {selectedModels.map(m => (
                    <td key={m.id} className="py-4 px-4 font-mono text-foreground">
                      {m.contextLength.toLocaleString()} tokens
                    </td>
                  ))}
                </tr>
                {/* Price Input */}
                <tr>
                  <td className="py-4 px-4 font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    Cost/1M Prompt
                    <HelpCircle className="h-3 w-3 text-muted-foreground/60" title="Cost in USD per one million input tokens" />
                  </td>
                  {selectedModels.map(m => (
                    <td key={m.id} className="py-4 px-4 font-semibold">
                      {m.inputPrice === 0 ? (
                        <span className="text-emerald-500 font-bold">$0.00 (Free)</span>
                      ) : (
                        <span className="text-foreground">${m.inputPrice.toFixed(2)}</span>
                      )}
                    </td>
                  ))}
                </tr>
                {/* Price Output */}
                <tr>
                  <td className="py-4 px-4 font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    Cost/1M Completion
                    <HelpCircle className="h-3 w-3 text-muted-foreground/60" title="Cost in USD per one million output tokens" />
                  </td>
                  {selectedModels.map(m => (
                    <td key={m.id} className="py-4 px-4 font-semibold">
                      {m.outputPrice === 0 ? (
                        <span className="text-emerald-500 font-bold">$0.00 (Free)</span>
                      ) : (
                        <span className="text-foreground">${m.outputPrice.toFixed(2)}</span>
                      )}
                    </td>
                  ))}
                </tr>
                {/* Modalities */}
                <tr>
                  <td className="py-4 px-4 font-bold text-muted-foreground uppercase tracking-wider">Modalities</td>
                  {selectedModels.map(m => (
                    <td key={m.id} className="py-4 px-4">
                      <span className="bg-secondary px-2 py-1 rounded text-[10px] font-medium text-foreground">
                        {m.modalities}
                      </span>
                    </td>
                  ))}
                </tr>
                {/* Local Benchmark Stats */}
                <tr>
                  <td className="py-4 px-4 font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    Avg. Quality Score
                    <HelpCircle className="h-3 w-3 text-muted-foreground/60" title="Average accuracy across local benchmark runs" />
                  </td>
                  {selectedModels.map(m => (
                    <td key={m.id} className="py-4 px-4 font-bold">
                      {m.type === 'Local' ? (
                        m.avgScore !== undefined ? (
                          <span className="text-emerald-500 flex items-center gap-1">
                            <Award className="h-3.5 w-3.5" />
                            {Math.round(m.avgScore * 100)}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50 italic">Not tested</span>
                        )
                      ) : (
                        <span className="text-muted-foreground/50 italic">N/A (Cloud)</span>
                      )}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-4 px-4 font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    Avg. Speed (TPS)
                    <HelpCircle className="h-3 w-3 text-muted-foreground/60" title="Average throughput in tokens per second" />
                  </td>
                  {selectedModels.map(m => (
                    <td key={m.id} className="py-4 px-4 font-semibold">
                      {m.type === 'Local' ? (
                        m.avgTps !== undefined ? (
                          <span className="text-foreground">{m.avgTps.toFixed(1)} t/s</span>
                        ) : (
                          <span className="text-muted-foreground/50 italic">Not tested</span>
                        )
                      ) : (
                        <span className="text-muted-foreground/50 italic">N/A (Cloud)</span>
                      )}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-4 px-4 font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    Avg. Latency (TTFT)
                    <HelpCircle className="h-3 w-3 text-muted-foreground/60" title="Time to first token in milliseconds" />
                  </td>
                  {selectedModels.map(m => (
                    <td key={m.id} className="py-4 px-4">
                      {m.type === 'Local' ? (
                        m.avgTtft !== undefined ? (
                          <span className="text-foreground">{Math.round(m.avgTtft)} ms</span>
                        ) : (
                          <span className="text-muted-foreground/50 italic">Not tested</span>
                        )
                      ) : (
                        <span className="text-muted-foreground/50 italic">N/A (Cloud)</span>
                      )}
                    </td>
                  ))}
                </tr>
                {/* Description */}
                <tr>
                  <td className="py-4 px-4 font-bold text-muted-foreground uppercase tracking-wider">Description</td>
                  {selectedModels.map(m => (
                    <td key={m.id} className="py-4 px-4 text-muted-foreground leading-relaxed text-[11px] max-w-[280px]">
                      {m.description}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 bg-card border border-border rounded-xl border-dashed">
          <Scale className="h-12 w-12 text-muted-foreground opacity-30 mb-3" />
          <p className="text-sm font-semibold text-muted-foreground">Select models above to compare them side-by-side</p>
        </div>
      )}
    </div>
  );
}
