import { useState, useEffect, useRef } from 'react';
import { useProvidersStore } from '../store/providersStore';
import { useSettingsStore } from '../store/settingsStore';
import { Send, Trash2, Zap, Clock, Square, MessageSquare, AlertCircle, RefreshCw } from 'lucide-react';
import Markdown from 'react-markdown';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  tps?: number;
  ttft?: number;
  duration?: number;
  error?: string;
  isStreaming?: boolean;
}

interface StreamStats {
  firstTokenTime: number;
  lastTokenTime: number;
  startTime: number;
  tokenCount: number;
}

export default function Playground() {
  const { models, providers, loadProviders } = useProvidersStore();
  const settings = useSettingsStore();

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

  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [temperature, setTemperature] = useState(settings.defaultTemperature);
  const [maxTokens, setMaxTokens] = useState(settings.defaultMaxTokens);
  const [inputText, setInputText] = useState('');
  
  // Conversations per model ID
  const [conversations, setConversations] = useState<Record<string, Message[]>>({});
  const [activeStreams, setActiveStreams] = useState<Record<string, { streamId: string; modelId: string }>>({});

  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;

  const streamStatsRef = useRef<Record<string, StreamStats>>({});
  const chatEndRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Clean model name for headers
  const getCleanName = (id: string) => id.split('/').pop()?.split(':')?.[0] ?? id;

  // Initialize selected models on mount
  useEffect(() => {
    if (models.length > 0 && selectedModels.length === 0) {
      setSelectedModels([models[0].id]);
    }
  }, [models]);

  // Subscribe to playground token events
  useEffect(() => {
    const unsubscribe = window.electronAPI.onPlaygroundToken((data) => {
      const { streamId, content, done, error } = data;
      const streamInfo = activeStreams[streamId];
      if (!streamInfo) return;

      const { modelId } = streamInfo;
      const stats = streamStatsRef.current[streamId] || {
        firstTokenTime: 0,
        lastTokenTime: 0,
        startTime: Date.now(),
        tokenCount: 0
      };

      if (!streamStatsRef.current[streamId]) {
        streamStatsRef.current[streamId] = stats;
      }

      // Track TTFT on first content chunk
      if (content && stats.firstTokenTime === 0) {
        stats.firstTokenTime = Date.now();
      }

      if (content) {
        stats.lastTokenTime = Date.now();
        // Crude word proxy for token counting
        stats.tokenCount += content.split(/\s+/).filter(Boolean).length || 1;
      }

      setConversations(prev => {
        const history = prev[modelId] ? [...prev[modelId]] : [];
        if (history.length === 0) return prev;

        const lastMsg = { ...history[history.length - 1] };
        if (lastMsg.role === 'assistant') {
          lastMsg.content += content;
          if (error) {
            lastMsg.error = error === 'CANCELLED' ? 'Cancelled by user.' : error;
            lastMsg.isStreaming = false;
          }
          if (done) {
            lastMsg.isStreaming = false;
            
            // Calculate final stats
            const totalDurationMs = Date.now() - stats.startTime;
            const activeGenTimeMs = stats.lastTokenTime - stats.firstTokenTime;
            const ttft = stats.firstTokenTime > 0 ? stats.firstTokenTime - stats.startTime : 0;
            
            let tps = 0;
            if (activeGenTimeMs > 0 && stats.tokenCount > 0) {
              tps = stats.tokenCount / (activeGenTimeMs / 1000);
            } else if (totalDurationMs > 0 && stats.tokenCount > 0) {
              tps = stats.tokenCount / (totalDurationMs / 1000);
            }

            lastMsg.ttft = Math.round(ttft);
            lastMsg.tps = Math.round(tps * 10) / 10;
            lastMsg.duration = totalDurationMs;
          }
          history[history.length - 1] = lastMsg;
        }
        return { ...prev, [modelId]: history };
      });

      if (done || error) {
        // Remove active stream
        setActiveStreams(prev => {
          const next = { ...prev };
          delete next[streamId];
          return next;
        });
        delete streamStatsRef.current[streamId];
      }
    });

    return () => {
      unsubscribe();
    };
  }, [activeStreams]);

  // Scroll to bottom helper
  useEffect(() => {
    Object.keys(conversations).forEach(modelId => {
      chatEndRefs.current[modelId]?.scrollIntoView({ behavior: 'smooth' });
    });
  }, [conversations]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || selectedModels.length === 0) return;

    const textToSend = inputText;
    setInputText('');

    // Pre-populate user prompt and empty assistant response for each model
    const newConversations = { ...conversationsRef.current };
    const newActiveStreams = { ...activeStreams };

    for (const modelId of selectedModels) {
      const modelHistory = newConversations[modelId] ? [...newConversations[modelId]] : [];
      modelHistory.push({ role: 'user', content: textToSend });
      modelHistory.push({ role: 'assistant', content: '', isStreaming: true });
      newConversations[modelId] = modelHistory;

      // Initiate IPC stream session
      const streamId = `stream-${modelId}-${Date.now()}`;
      const foundModel = models.find(m => m.id === modelId);
      const provider = foundModel?.provider ?? 'Ollama';
      const providerUrl = providers.find(p => p.name === provider)?.url;

      // Convert full conversation to system/user format
      const recentHistory = modelHistory.slice(0, -1).map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      newActiveStreams[streamId] = { streamId, modelId };
      streamStatsRef.current[streamId] = {
        startTime: Date.now(),
        firstTokenTime: 0,
        lastTokenTime: 0,
        tokenCount: 0
      };

      // Fire and forget, token callbacks update state asynchronously
      window.electronAPI.playgroundChat({
        providerName: provider,
        url: providerUrl,
        modelId,
        messages: recentHistory,
        temperature,
        maxTokens,
        streamId,
        apiKeys: settings.apiKeys
      }).catch(err => {
        console.error(`Failed to start playground stream for ${modelId}:`, err);
        setConversations(prev => {
          const hist = prev[modelId] ? [...prev[modelId]] : [];
          if (hist.length > 0) {
            hist[hist.length - 1] = {
              role: 'assistant',
              content: '',
              isStreaming: false,
              error: err?.message ?? 'Failed to stream response.'
            };
          }
          return { ...prev, [modelId]: hist };
        });
      });
    }

    setConversations(newConversations);
    setActiveStreams(newActiveStreams);
  };

  const handleStopAll = () => {
    Object.keys(activeStreams).forEach(streamId => {
      window.electronAPI.playgroundCancel(streamId);
    });
    setActiveStreams({});
  };

  const handleClearChat = () => {
    setConversations({});
    handleStopAll();
  };

  const handleModelSelectToggle = (id: string) => {
    if (selectedModels.includes(id)) {
      setSelectedModels(selectedModels.filter(m => m !== id));
    } else {
      if (selectedModels.length >= 3) {
        // limit 3 models side-by-side maximum
        setSelectedModels([...selectedModels.slice(1), id]);
      } else {
        setSelectedModels([...selectedModels, id]);
      }
    }
  };

  const isStreaming = Object.keys(activeStreams).length > 0;

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] select-none">
      
      {/* Settings Row */}
      <div className="p-4 rounded-xl bg-card border border-border shadow-sm flex flex-wrap items-center justify-between gap-4 shrink-0">
        
        {/* Model Selection tags */}
        <div className="space-y-1.5 flex-1 min-w-[280px]">
          <span className="text-xs font-bold text-muted-foreground block">Select Models to Compare (Max 3)</span>
          <div className="flex flex-wrap gap-2">
            {models.map(m => {
              const isChecked = selectedModels.includes(m.id);
              return (
                <div
                  key={m.id}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-all duration-150 ${
                    isChecked
                      ? 'bg-primary/10 border-primary/45 text-primary shadow-sm shadow-primary/5'
                      : 'bg-secondary/45 border-border/80 text-muted-foreground hover:bg-secondary hover:text-foreground'
                  }`}
                >
                  <span
                    onClick={() => handleModelSelectToggle(m.id)}
                    className="truncate max-w-[120px] cursor-pointer flex items-center gap-1"
                    title={m.name}
                  >
                    {getCleanName(m.name)}
                    <span className="text-[9px] opacity-60 uppercase font-bold shrink-0">({m.provider})</span>
                  </span>
                  {m.provider.toLowerCase() === 'ollama' && (
                    <button
                      disabled={isDeleting[m.id]}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteModel(m.id, m.name);
                      }}
                      className="p-0.5 rounded hover:bg-red-500/10 text-red-500 hover:text-red-400 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
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
              );
            })}
            {models.length === 0 && (
              <span className="text-xs text-muted-foreground italic flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5" />
                No local models available. Rescan local hosts on LLM Providers page.
              </span>
            )}
          </div>
        </div>

        {/* Hyperparameters */}
        <div className="flex items-center gap-4 text-xs font-semibold shrink-0">
          
          {/* Temperature */}
          <div className="space-y-1">
            <span className="text-muted-foreground block">Temperature ({temperature})</span>
            <input 
              type="range" 
              min="0.0" 
              max="1.0" 
              step="0.1"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="w-24 accent-primary"
            />
          </div>

          {/* Max Tokens */}
          <div className="space-y-1">
            <span className="text-muted-foreground block font-semibold">Max Tokens</span>
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

          {/* Reset button */}
          <button 
            onClick={handleClearChat}
            className="btn-secondary h-8 px-3 flex items-center gap-1 text-[11px] font-bold text-red-500 hover:bg-red-500/5 hover:border-red-500/20"
            title="Clear Chat Thread"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear Chat
          </button>
        </div>

      </div>

      {/* Main Conversation Window */}
      <div className="flex-1 min-h-0 flex gap-4 mt-4 overflow-hidden">
        {selectedModels.map(modelId => {
          const chatHistory = conversations[modelId] || [];
          
          return (
            <div 
              key={modelId} 
              className="flex-1 flex flex-col min-w-0 bg-card border border-border rounded-xl shadow-sm overflow-hidden"
            >
              {/* Header column label */}
              <div className="p-3 border-b border-border/80 bg-secondary/20 flex items-center justify-between shrink-0">
                <span className="font-bold text-xs text-foreground truncate block max-w-[200px]" title={modelId}>
                  {getCleanName(modelId)}
                </span>
                <span className="text-[9px] uppercase font-extrabold px-1.5 py-0.5 rounded bg-primary/10 text-primary shrink-0 leading-none">
                  {models.find(m => m.id === modelId)?.provider || 'Ollama'}
                </span>
              </div>

              {/* Thread Scroll Container */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {chatHistory.map((msg, idx) => (
                  <div 
                    key={idx} 
                    className={`flex flex-col space-y-1.5 ${
                      msg.role === 'user' ? 'items-end' : 'items-start'
                    }`}
                  >
                    {/* Speaker name */}
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      {msg.role === 'user' ? 'You' : getCleanName(modelId)}
                    </span>

                    {/* Bubble */}
                    <div className={`p-3 rounded-2xl max-w-[90%] text-xs leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/5 rounded-tr-none'
                        : 'bg-secondary/40 text-foreground border border-border/60 rounded-tl-none select-text'
                    }`}>
                      
                      {msg.error ? (
                        <div className="flex items-center gap-1.5 text-red-500 font-semibold leading-normal">
                          <AlertCircle className="h-4 w-4 shrink-0" />
                          <span>{msg.error}</span>
                        </div>
                      ) : msg.role === 'assistant' ? (
                        <div className="markdown-body">
                          {msg.isStreaming && !msg.content ? (
                            <div className="flex items-center gap-2 py-1 select-none">
                              <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" />
                              <span className="text-[11px] text-muted-foreground font-medium">Thinking...</span>
                            </div>
                          ) : (
                            <Markdown>{msg.content ? (msg.content + (msg.isStreaming ? ' ▋' : '')) : 'No response content.'}</Markdown>
                          )}
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      )}

                      {/* Performance tags under assistant message */}
                      {msg.role === 'assistant' && !msg.isStreaming && !msg.error && (
                        <div className="flex gap-3 text-[9px] font-bold text-muted-foreground/80 mt-2 border-t border-border/30 pt-1.5">
                          {msg.tps !== undefined && msg.tps > 0 && (
                            <span className="flex items-center gap-1 text-amber-500">
                              <Zap className="h-3 w-3 fill-current" />
                              {msg.tps} TPS
                            </span>
                          )}
                          {msg.ttft !== undefined && msg.ttft > 0 && (
                            <span className="flex items-center gap-0.5">
                              <Clock className="h-3 w-3" />
                              {msg.ttft}ms TTFT
                            </span>
                          )}
                          {msg.duration !== undefined && msg.duration > 0 && (
                            <span>
                              {(msg.duration / 1000).toFixed(1)}s total
                            </span>
                          )}
                        </div>
                      )}

                    </div>
                  </div>
                ))}
                
                {chatHistory.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground/60 py-20 space-y-2">
                    <MessageSquare className="h-8 w-8 opacity-30 text-primary animate-pulse" />
                    <span className="text-xs font-semibold">Thread empty. Send a prompt below to evaluate response logic.</span>
                  </div>
                )}

                <div ref={el => chatEndRefs.current[modelId] = el} />
              </div>
            </div>
          );
        })}

        {selectedModels.length === 0 && (
          <div className="flex-1 bg-card border border-border rounded-xl flex flex-col items-center justify-center text-center text-muted-foreground py-20">
            <MessageSquare className="h-10 w-10 opacity-30 text-primary animate-pulse mb-3" />
            <h4 className="font-bold text-sm">Select at least one local LLM model above to begin.</h4>
            <p className="text-xs text-muted-foreground mt-0.5">Compare prompt performance, word structuring, and speeds side-by-side.</p>
          </div>
        )}
      </div>

      {/* Input box */}
      <form onSubmit={handleSend} className="mt-4 shrink-0 flex items-center gap-3 relative">
        <input
          type="text"
          disabled={selectedModels.length === 0}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={
            selectedModels.length === 0 
              ? 'Select models to compare first...' 
              : isStreaming 
                ? 'Awaiting streaming response completions...'
                : 'Write your ad-hoc evaluation prompt...'
          }
          className="form-input text-xs h-11 pr-24 disabled:opacity-50"
        />

        <div className="absolute right-3 top-2 flex items-center gap-2">
          {isStreaming ? (
            <button 
              type="button"
              onClick={handleStopAll}
              className="h-7 px-3 bg-red-500 hover:bg-red-400 text-white font-bold rounded-lg text-[10px] uppercase flex items-center gap-1 transition-colors"
            >
              <Square className="h-3 w-3 fill-current" />
              Stop
            </button>
          ) : (
            <button 
              type="submit"
              disabled={!inputText.trim() || selectedModels.length === 0}
              className="h-7 px-3 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground font-bold rounded-lg text-[10px] uppercase flex items-center gap-1 transition-all"
            >
              <Send className="h-3 w-3" />
              Send
            </button>
          )}
        </div>
      </form>

    </div>
  );
}
