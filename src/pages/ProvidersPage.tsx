import { useState } from 'react';
import { useProvidersStore } from '../store/providersStore';
import { Cpu, RefreshCw, Plus, Trash2, HardDrive, Cpu as CpuIcon, Layers, BrainCircuit, Globe } from 'lucide-react';

export default function ProvidersPage() {
  const { 
    providers, models, systemInfo, isDiscovering, isLoading, 
    loadProviders, addCustomProvider, removeCustomProvider 
  } = useProvidersStore();

  const [newProvName, setNewProvName] = useState('');
  const [newProvUrl, setNewProvUrl] = useState('');
  const [addStatus, setAddStatus] = useState<'idle' | 'success' | 'failed'>('idle');
  const [isStartingServer, setIsStartingServer] = useState(false);
  const [isStoppingServer, setIsStoppingServer] = useState(false);

  const handleStartOllamaServer = async () => {
    setIsStartingServer(true);
    try {
      const success = await window.electronAPI.startOllamaServer();
      if (success) {
        setTimeout(async () => {
          await loadProviders();
          setIsStartingServer(false);
        }, 1500);
      } else {
        alert("Failed to start Ollama server. Make sure Ollama is installed on your system.");
        setIsStartingServer(false);
      }
    } catch (err) {
      console.error(err);
      setIsStartingServer(false);
    }
  };

  const handleStopOllamaServer = async () => {
    setIsStoppingServer(true);
    try {
      const success = await window.electronAPI.stopOllamaServer();
      if (success) {
        setTimeout(async () => {
          await loadProviders();
          setIsStoppingServer(false);
        }, 1000);
      } else {
        alert("Failed to stop Ollama server.");
        setIsStoppingServer(false);
      }
    } catch (err) {
      console.error(err);
      setIsStoppingServer(false);
    }
  };

  const [isDeleting, setIsDeleting] = useState<Record<string, boolean>>({});

  const handleDeleteModel = async (modelId: string, modelName: string) => {
    if (!window.confirm(`Are you sure you want to remove the model "${modelName}" (${modelId}) from your device?`)) {
      return;
    }

    setIsDeleting(prev => ({ ...prev, [modelId]: true }));
    try {
      const success = await window.electronAPI.deleteModel(modelId);
      if (success) {
        // Reload all providers to update model lists and caches
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

  const handleAddCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProvName || !newProvUrl) return;

    setAddStatus('idle');
    const success = await addCustomProvider(newProvName, newProvUrl);
    if (success) {
      setAddStatus('success');
      setNewProvName('');
      setNewProvUrl('');
    } else {
      setAddStatus('failed');
    }
  };

  const getProviderColor = (name: string) => {
    switch (name) {
      case "Ollama": return "border-l-ollama bg-ollama/5 text-ollama";
      case "LM Studio": return "border-l-lmstudio bg-lmstudio/5 text-lmstudio";
      case "Jan": return "border-l-jan bg-jan/5 text-jan";
      case "GPT4All": return "border-l-gpt4all bg-gpt4all/5 text-gpt4all";
      case "llama.cpp": return "border-l-llamacpp bg-llamacpp/5 text-llamacpp";
      default: return "border-l-primary bg-primary/5 text-primary";
    }
  };

  const formatSize = (bytes?: number) => {
    if (bytes === undefined || bytes === null) return '';
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(1)} GB`;
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(0)} MB`;
  };

  return (
    <div className="space-y-6">
      
      {/* Header Row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">LLM Providers</h2>
          <p className="text-sm text-muted-foreground">Manage your local LLM engine configurations.</p>
        </div>
        <button 
          onClick={loadProviders}
          disabled={isDiscovering}
          className="btn-secondary h-9 flex items-center gap-1.5 text-xs disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isDiscovering ? 'animate-spin' : ''}`} />
          Scan Providers
        </button>
      </div>

      {/* Hardware Telemetry Info Strip */}
      {systemInfo && (
        <div className="p-4 rounded-xl bg-card border border-border shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Cpu className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold">Local Host Hardware</h3>
              <p className="text-xs text-muted-foreground">Telemetry used to gauge local model compatibility.</p>
            </div>
          </div>
          
          <div className="grid grid-cols-2 md:flex gap-4 md:gap-8 text-xs">
            <div>
              <span className="text-muted-foreground block font-medium">CPU</span>
              <span className="font-semibold text-foreground truncate max-w-[200px] block" title={systemInfo.cpuBrand}>
                {systemInfo.cpuBrand}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block font-medium">Memory RAM</span>
              <span className="font-semibold text-foreground">
                {systemInfo.ramAvailableGB} GB free / {systemInfo.ramTotalGB} GB total
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block font-medium">GPU Accelerator</span>
              <span className="font-semibold text-foreground flex items-center gap-1.5">
                <span className="truncate max-w-[150px]" title={systemInfo.gpuBrand}>{systemInfo.gpuBrand}</span>
                {systemInfo.isAppleSilicon && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-500 uppercase leading-none">
                    Metal GPU
                  </span>
                )}
                {!systemInfo.isAppleSilicon && systemInfo.gpuBrand.toLowerCase().includes("nvidia") && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-500 uppercase leading-none">
                    CUDA
                  </span>
                )}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block font-medium">OS Environment</span>
              <span className="font-semibold text-foreground capitalize">
                {systemInfo.platform} ({systemInfo.arch})
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Grid: Left 2/3 Providers, Right 1/3 Manual Add Custom */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2/3: Discovered Providers Cards */}
        <div className="lg:col-span-2 space-y-4">
          <h3 className="text-base font-bold">Configured LLM Services</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {providers.map(p => {
              const isCustom = !["Ollama", "LM Studio", "Jan", "GPT4All", "llama.cpp"].includes(p.name);
              return (
                <div 
                  key={p.url} 
                  className={`p-4 rounded-xl bg-card border border-border border-l-4 shadow-sm flex flex-col justify-between h-40 ${getProviderColor(p.name)}`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-bold text-base text-foreground flex items-center gap-1.5">
                        {p.name}
                        {isCustom && <Globe className="h-3.5 w-3.5 text-muted-foreground" />}
                      </h4>
                      <code className="text-[10px] text-muted-foreground select-all bg-secondary/80 px-1 py-0.5 rounded block mt-0.5 font-mono truncate max-w-[200px]">
                        {p.url}
                      </code>
                    </div>
                    
                    <div className="flex items-center gap-1.5">
                      <span className={`h-2.5 w-2.5 rounded-full ${p.isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                      <span className="text-xs font-semibold text-foreground">
                        {p.isConnected ? 'Connected' : 'Offline'}
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center mt-4 border-t border-border/40 pt-3">
                    <span className="text-xs font-semibold text-muted-foreground">
                      {p.isConnected ? `${p.modelCount} models loaded` : 'No models available'}
                    </span>
                    
                    {p.name === "Ollama" && (
                      <div className="flex gap-1.5 shrink-0 select-none">
                        <button
                          disabled={p.isConnected || isStartingServer}
                          onClick={handleStartOllamaServer}
                          className="px-2 py-1 bg-emerald-500/10 disabled:opacity-45 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/20 disabled:border-emerald-500/10 text-[10px] font-bold rounded-lg transition-all cursor-pointer disabled:cursor-not-allowed leading-none flex items-center justify-center h-6.5"
                        >
                          {isStartingServer ? 'Starting...' : 'Start Server'}
                        </button>
                        <button
                          disabled={!p.isConnected || isStoppingServer}
                          onClick={handleStopOllamaServer}
                          className="px-2 py-1 bg-red-500/10 disabled:opacity-45 hover:bg-red-500/20 text-red-500 border border-red-500/20 disabled:border-red-500/10 text-[10px] font-bold rounded-lg transition-all cursor-pointer disabled:cursor-not-allowed leading-none flex items-center justify-center h-6.5"
                        >
                          {isStoppingServer ? 'Stopping...' : 'Stop Server'}
                        </button>
                      </div>
                    )}

                    {isCustom && (
                      <button 
                        onClick={() => removeCustomProvider(p.url)}
                        className="p-1.5 rounded hover:bg-red-500/10 text-red-500 hover:text-red-400 transition-colors"
                        title="Remove custom endpoint"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            
            {providers.length === 0 && (
              <div className="col-span-2 p-12 text-center text-muted-foreground border border-border border-dashed rounded-xl">
                No active services scanned. Hit Rescan to search ports.
              </div>
            )}
          </div>
        </div>

        {/* Right 1/3: Add Custom Endpoint */}
        <div className="lg:col-span-1 p-5 rounded-xl bg-card border border-border shadow-sm h-fit">
          <h3 className="text-base font-bold">Add Custom Service</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Integrate custom OpenAI-compatible server ports.</p>
          
          <form onSubmit={handleAddCustom} className="mt-4 space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="custom-name" className="text-xs font-bold text-muted-foreground">Service Name</label>
              <input 
                id="custom-name"
                type="text" 
                placeholder="e.g. Local vLLM"
                value={newProvName}
                onChange={(e) => setNewProvName(e.target.value)}
                className="form-input text-xs h-9"
                required
              />
            </div>
            
            <div className="space-y-1.5">
              <label htmlFor="custom-url" className="text-xs font-bold text-muted-foreground">Base API URL</label>
              <input 
                id="custom-url"
                type="url" 
                placeholder="http://localhost:5000"
                value={newProvUrl}
                onChange={(e) => setNewProvUrl(e.target.value)}
                className="form-input text-xs h-9 font-mono"
                required
              />
            </div>

            {addStatus === 'success' && (
              <p className="text-xs font-semibold text-emerald-500">Connection test passed and added successfully!</p>
            )}
            {addStatus === 'failed' && (
              <p className="text-xs font-semibold text-red-500">Connection test failed. Host offline or invalid API.</p>
            )}

            <button 
              type="submit" 
              disabled={isLoading || isDiscovering}
              className="w-full btn-primary h-9 text-xs flex items-center justify-center gap-1.5 disabled:opacity-50 mt-4"
            >
              <Plus className="h-4 w-4" />
              Add Custom Endpoint
            </button>
          </form>
        </div>

      </div>

      {/* Discovered Models Grid */}
      <div className="space-y-4">
        <h3 className="text-base font-bold">Discovered Model Registry ({models.length} Models)</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {models.map(m => (
            <div 
              key={`${m.provider}:${m.id}`}
              className="p-4 rounded-xl bg-card border border-border shadow-sm flex flex-col justify-between hover:border-muted-foreground/30 transition-all duration-150 relative overflow-hidden"
            >
              <div>
                {/* Model Header */}
                <div className="flex justify-between items-start gap-2">
                  <h4 className="font-bold text-sm text-foreground truncate max-w-[140px]" title={m.name}>
                    {m.name.split('/').pop()}
                  </h4>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-secondary text-muted-foreground`}>
                      {m.provider}
                    </span>
                    {m.provider.toLowerCase() === 'ollama' && (
                      <button
                        disabled={isDeleting[m.id]}
                        onClick={() => handleDeleteModel(m.id, m.name)}
                        className="p-1 rounded hover:bg-red-500/10 text-red-500 hover:text-red-400 transition-colors cursor-pointer disabled:opacity-50"
                        title="Delete model from device"
                      >
                        {isDeleting[m.id] ? (
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
                
                {/* Model Path ID */}
                <code className="text-[10px] text-muted-foreground bg-secondary/50 px-1 py-0.5 rounded block mt-1 font-mono truncate select-all">
                  {m.id}
                </code>

                {/* Metadata Chips */}
                <div className="flex flex-wrap gap-1.5 mt-3 text-[10px] font-semibold text-muted-foreground">
                  {m.size !== undefined && (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-secondary/80 text-foreground border border-border/40">
                      <BrainCircuit className="h-3 w-3 text-primary" />
                      {m.size}B Params
                    </span>
                  )}
                  {m.quantization && (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-secondary/80 text-foreground border border-border/40">
                      <Layers className="h-3 w-3 text-amber-500" />
                      {m.quantization}
                    </span>
                  )}
                  {m.contextLength && (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-secondary/80 text-foreground border border-border/40">
                      <HardDrive className="h-3 w-3 text-violet-500" />
                      {m.contextLength} Context
                    </span>
                  )}
                </div>
              </div>

              {/* Disk Size / Modified */}
              <div className="flex justify-between items-center text-[10px] text-muted-foreground border-t border-border/40 pt-2.5 mt-3.5">
                <span>
                  {m.modifiedAt && !isNaN(new Date(m.modifiedAt).getTime()) 
                    ? `Discovered ${new Date(m.modifiedAt).toLocaleDateString()}` 
                    : 'Cached'}
                </span>
                
                {m.sizeOnDisk !== undefined && (
                  <span className="font-semibold text-foreground">
                    {formatSize(m.sizeOnDisk)}
                  </span>
                )}
              </div>
            </div>
          ))}

          {models.length === 0 && (
            <div className="col-span-3 p-12 text-center text-muted-foreground border border-border border-dashed rounded-xl">
              <CpuIcon className="h-10 w-10 mx-auto opacity-30 mb-2" />
              No local models registered. Turn on Ollama or LM Studio and run a provider scan.
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
