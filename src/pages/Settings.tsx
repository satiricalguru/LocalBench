import { useState, useEffect } from 'react';
import { useSettingsStore } from '../store/settingsStore';
import { useProvidersStore } from '../store/providersStore';
import type { BenchmarkTask } from '../types';
import { 
  Database, Trash2, Edit2, 
  Check, Save, RefreshCw, AlertTriangle, Key, Eye, EyeOff
} from 'lucide-react';
import ConfirmModal from '../components/ConfirmModal';
import { showToast } from '../components/Toast';

export default function Settings() {
  const settings = useSettingsStore();

  const [dbPath, setDbPath] = useState('Loading...');
  const [concurrency, setConcurrency] = useState(settings.concurrency);
  const [timeout, setTimeoutVal] = useState(settings.defaultTimeout);
  const [temperature, setTemperature] = useState(settings.defaultTemperature);
  const [maxTokens, setMaxTokens] = useState(settings.defaultMaxTokens);

  // API keys states
  const [openaiKey, setOpenaiKey] = useState(settings.apiKeys?.openai ?? '');
  const [anthropicKey, setAnthropicKey] = useState(settings.apiKeys?.anthropic ?? '');
  const [geminiKey, setGeminiKey] = useState(settings.apiKeys?.gemini ?? '');
  const [openrouterKey, setOpenrouterKey] = useState(settings.apiKeys?.openrouter ?? '');

  // Toggle visibility states
  const [showOpenai, setShowOpenai] = useState(false);
  const [showAnthropic, setShowAnthropic] = useState(false);
  const [showGemini, setShowGemini] = useState(false);
  const [showOpenrouter, setShowOpenrouter] = useState(false);

  // Weights state
  const [wQuality, setWQuality] = useState(settings.weights.quality);
  const [wSpeed, setWSpeed] = useState(settings.weights.speed);
  const [wTtft, setWTtft] = useState(settings.weights.ttft);

  // Confirm modal state
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Custom task form state
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskName, setTaskName] = useState('');
  const [taskCategory, setTaskCategory] = useState<BenchmarkTask['category']>('reasoning');
  const [taskPrompt, setTaskPrompt] = useState('');
  const [taskSystemPrompt, setTaskSystemPrompt] = useState('');
  const [taskTemp, setTaskTemp] = useState(0.0);
  const [taskMaxTokens, setTaskMaxTokens] = useState(256);
  const [taskExpected, setTaskExpected] = useState('');
  const [taskScorer, setTaskScorer] = useState('contains');

  useEffect(() => {
    // Get database path on load
    window.electronAPI.getDatabasePath().then(path => {
      setDbPath(path);
    }).catch(() => {
      setDbPath('Unavailable');
    });
  }, []);

  // Sync API keys states when store updates
  useEffect(() => {
    setOpenaiKey(settings.apiKeys?.openai ?? '');
    setAnthropicKey(settings.apiKeys?.anthropic ?? '');
    setGeminiKey(settings.apiKeys?.gemini ?? '');
    setOpenrouterKey(settings.apiKeys?.openrouter ?? '');
  }, [settings.apiKeys]);

  const handleSaveApiKeys = () => {
    settings.setApiKeys({
      openai: openaiKey || undefined,
      anthropic: anthropicKey || undefined,
      gemini: geminiKey || undefined,
      openrouter: openrouterKey || undefined
    });
    // Trigger provider discovery reload
    useProvidersStore.getState().loadProviders();
    showToast('success', 'Cloud API keys saved. Discovered models updated.');
  };

  // Save changes to general settings
  const handleSaveGeneral = () => {
    settings.setConcurrency(concurrency);
    settings.setDefaultTimeout(timeout);
    settings.setTemperature(temperature);
    settings.setMaxTokens(maxTokens);
    showToast('success', 'General settings saved successfully.');
  };

  // Save weights changes
  const handleSaveWeights = () => {
    const sum = wQuality + wSpeed + wTtft;
    if (sum !== 100) {
      showToast('error', `Weights must sum to exactly 100%. Current sum: ${sum}%`);
      return;
    }
    settings.setWeights({
      quality: wQuality,
      speed: wSpeed,
      ttft: wTtft
    });
    showToast('success', 'Scoring weights updated successfully.');
  };

  // Clear SQLite history
  const handleClearHistory = async () => {
    setShowClearConfirm(true);
  };

  const executeClearHistory = async () => {
    try {
      await window.electronAPI.clearAllHistory();
      showToast('success', 'Benchmark history cleared.');
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to clear history.');
    }
  };

  // Backup SQLite database
  const handleBackupDB = async () => {
    try {
      const backupPath = await window.electronAPI.backupDatabase();
      if (backupPath) {
        showToast('success', `Database backup created at:\n${backupPath}`);
      }
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to back up database.');
    }
  };

  // Custom task CRUD actions
  const handleSaveTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskName || !taskPrompt) return;

    const newTask: BenchmarkTask = {
      id: editingTaskId ?? `custom-task-${Date.now()}`,
      name: taskName,
      category: taskCategory,
      description: `Custom evaluator task created on settings.`,
      prompt: taskPrompt,
      systemPrompt: taskSystemPrompt || undefined,
      temperature: taskTemp,
      maxTokens: taskMaxTokens,
      timeoutMs: timeout * 1000,
      expectedOutput: taskExpected || undefined,
      scorerType: taskScorer
    };

    if (editingTaskId) {
      settings.updateCustomTask(editingTaskId, newTask);
      setEditingTaskId(null);
    } else {
      settings.addCustomTask(newTask);
    }

    // Reset task form
    setTaskName('');
    setTaskCategory('reasoning');
    setTaskPrompt('');
    setTaskSystemPrompt('');
    setTaskTemp(0.0);
    setTaskMaxTokens(256);
    setTaskExpected('');
    setTaskScorer('contains');
  };

  const handleEditTask = (task: BenchmarkTask) => {
    setEditingTaskId(task.id);
    setTaskName(task.name);
    setTaskCategory(task.category);
    setTaskPrompt(task.prompt);
    setTaskSystemPrompt(task.systemPrompt ?? '');
    setTaskTemp(task.temperature);
    setTaskMaxTokens(task.maxTokens);
    setTaskExpected(task.expectedOutput ?? '');
    setTaskScorer(task.scorerType);
  };

  const weightsSum = wQuality + wSpeed + wTtft;

  return (
    <div className="space-y-6 select-none">
      
      {/* Title */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        <p className="text-sm text-muted-foreground">Customize evaluation constraints, scoring parameters, and tasks.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2/3 settings panel */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Section 1: General settings */}
          <div className="p-5 rounded-xl bg-card border border-border shadow-sm space-y-4">
            <h3 className="text-sm font-bold uppercase text-muted-foreground tracking-wider mb-2">General Benchmark Defaults</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {/* Concurrency */}
              <div className="space-y-1.5">
                <label className="text-muted-foreground font-semibold flex items-center gap-1.5">
                  Task Concurrency per Model
                  {concurrency > 1 && (
                    <span title="High concurrency distorts model TPS rates.">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                    </span>
                  )}
                </label>
                <input 
                  type="number" 
                  min="1" 
                  max="4" 
                  value={concurrency}
                  onChange={(e) => setConcurrency(parseInt(e.target.value) || 1)}
                  className="form-input text-xs"
                />
              </div>

              {/* Default Timeout */}
              <div className="space-y-1.5">
                <label className="text-muted-foreground font-semibold">Default Task Timeout (seconds)</label>
                <input 
                  type="number" 
                  min="10" 
                  max="600" 
                  value={timeout}
                  onChange={(e) => setTimeoutVal(parseInt(e.target.value) || 120)}
                  className="form-input text-xs"
                />
              </div>

              {/* Default Temperature */}
              <div className="space-y-1.5">
                <label className="text-muted-foreground font-semibold">Default Temperature (0.0 to 1.0)</label>
                <input 
                  type="number" 
                  min="0.0" 
                  max="1.0" 
                  step="0.1"
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value) || 0)}
                  className="form-input text-xs"
                />
              </div>

              {/* Default Max Tokens */}
              <div className="space-y-1.5">
                <label className="text-muted-foreground font-semibold">Default Max Tokens</label>
                <div className="flex items-center gap-1.5">
                  <input 
                    type="number" 
                    min="64" 
                    max="8192" 
                    value={maxTokens}
                    onChange={(e) => setMaxTokens(parseInt(e.target.value) || 512)}
                    className="form-input text-xs h-8 w-24 px-1.5 font-semibold"
                  />
                  <div className="flex gap-1 shrink-0">
                    {[256, 512, 1024, 2048, 4096].map(preset => (
                      <button
                        type="button"
                        key={preset}
                        onClick={() => setMaxTokens(preset)}
                        className={`h-8 px-2 rounded text-[10px] font-bold border transition-all duration-150 ${
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
            </div>

            <div className="flex justify-end pt-2">
              <button 
                onClick={handleSaveGeneral}
                className="btn-primary h-8 px-4 text-xs flex items-center gap-1.5"
              >
                <Save className="h-3.5 w-3.5" />
                Save General Defaults
              </button>
            </div>
          </div>

          {/* Section 2: Composite scoring weights */}
          <div className="p-5 rounded-xl bg-card border border-border shadow-sm space-y-4">
            <h3 className="text-sm font-bold uppercase text-muted-foreground tracking-wider mb-2">Composite Score Normalization Weights</h3>
            
            <div className="space-y-4 text-xs">
              {/* Quality weight */}
              <div className="space-y-1">
                <div className="flex justify-between font-semibold">
                  <span className="text-foreground">Accuracy / Quality Score</span>
                  <span className="text-primary font-bold">{wQuality}%</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  value={wQuality}
                  onChange={(e) => setWQuality(parseInt(e.target.value))}
                  className="w-full accent-primary"
                />
              </div>

              {/* Speed weight */}
              <div className="space-y-1">
                <div className="flex justify-between font-semibold">
                  <span className="text-foreground">Throughput (TPS) Score</span>
                  <span className="text-amber-500 font-bold">{wSpeed}%</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  value={wSpeed}
                  onChange={(e) => setWSpeed(parseInt(e.target.value))}
                  className="w-full accent-amber-500"
                />
              </div>

              {/* TTFT weight */}
              <div className="space-y-1">
                <div className="flex justify-between font-semibold">
                  <span className="text-foreground">Time To First Token (TTFT) Score</span>
                  <span className="text-violet-500 font-bold">{wTtft}%</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  value={wTtft}
                  onChange={(e) => setWTtft(parseInt(e.target.value))}
                  className="w-full accent-violet-500"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className={`font-semibold ${weightsSum === 100 ? 'text-emerald-500' : 'text-red-500 font-bold'}`}>
                  Sum of Weights: {weightsSum}% {weightsSum === 100 ? '(Valid)' : '(Must equal 100%)'}
                </span>
                
                <button 
                  onClick={handleSaveWeights}
                  disabled={weightsSum !== 100}
                  className="btn-primary h-8 px-4 text-xs flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Save className="h-3.5 w-3.5" />
                  Save weights
                </button>
              </div>
            </div>
          </div>

          {/* Section: Cloud API Keys */}
          <div className="p-5 rounded-xl bg-card border border-border shadow-sm space-y-4">
            <h3 className="text-sm font-bold uppercase text-muted-foreground tracking-wider mb-2 flex items-center gap-1.5">
              <Key className="h-4 w-4 text-primary" />
              Cloud Provider API Keys
            </h3>
            
            <div className="text-xs space-y-3.5">
              {/* OpenAI */}
              <div className="space-y-1">
                <label className="text-muted-foreground font-semibold block">OpenAI API Key</label>
                <div className="relative flex items-center">
                  <input 
                    type={showOpenai ? "text" : "password"} 
                    placeholder="sk-..." 
                    value={openaiKey}
                    onChange={(e) => setOpenaiKey(e.target.value)}
                    className="form-input text-xs pr-10"
                  />
                  <button 
                    type="button"
                    onClick={() => setShowOpenai(!showOpenai)}
                    className="absolute right-3 text-muted-foreground hover:text-foreground"
                  >
                    {showOpenai ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Anthropic */}
              <div className="space-y-1">
                <label className="text-muted-foreground font-semibold block">Anthropic API Key</label>
                <div className="relative flex items-center">
                  <input 
                    type={showAnthropic ? "text" : "password"} 
                    placeholder="sk-ant-..." 
                    value={anthropicKey}
                    onChange={(e) => setAnthropicKey(e.target.value)}
                    className="form-input text-xs pr-10"
                  />
                  <button 
                    type="button"
                    onClick={() => setShowAnthropic(!showAnthropic)}
                    className="absolute right-3 text-muted-foreground hover:text-foreground"
                  >
                    {showAnthropic ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Gemini */}
              <div className="space-y-1">
                <label className="text-muted-foreground font-semibold block">Gemini API Key</label>
                <div className="relative flex items-center">
                  <input 
                    type={showGemini ? "text" : "password"} 
                    placeholder="AIzaSy..." 
                    value={geminiKey}
                    onChange={(e) => setGeminiKey(e.target.value)}
                    className="form-input text-xs pr-10"
                  />
                  <button 
                    type="button"
                    onClick={() => setShowGemini(!showGemini)}
                    className="absolute right-3 text-muted-foreground hover:text-foreground"
                  >
                    {showGemini ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* OpenRouter */}
              <div className="space-y-1">
                <label className="text-muted-foreground font-semibold block">OpenRouter API Key</label>
                <div className="relative flex items-center">
                  <input 
                    type={showOpenrouter ? "text" : "password"} 
                    placeholder="sk-or-..." 
                    value={openrouterKey}
                    onChange={(e) => setOpenrouterKey(e.target.value)}
                    className="form-input text-xs pr-10"
                  />
                  <button 
                    type="button"
                    onClick={() => setShowOpenrouter(!showOpenrouter)}
                    className="absolute right-3 text-muted-foreground hover:text-foreground"
                  >
                    {showOpenrouter ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button 
                  onClick={handleSaveApiKeys}
                  className="btn-primary h-8 px-4 text-xs flex items-center gap-1.5"
                >
                  <Save className="h-3.5 w-3.5" />
                  Save API Keys
                </button>
              </div>
            </div>
          </div>

          {/* Section 3: SQLite Database details */}
          <div className="p-5 rounded-xl bg-card border border-border shadow-sm space-y-4">
            <h3 className="text-sm font-bold uppercase text-muted-foreground tracking-wider mb-2 flex items-center gap-1.5">
              <Database className="h-4 w-4 text-primary" />
              Database Registry Settings
            </h3>
            
            <div className="text-xs space-y-3">
              <div className="space-y-1">
                <span className="text-muted-foreground block font-medium">SQLite DB File Path</span>
                <code className="bg-secondary p-2 rounded block font-mono select-all break-all border border-border">
                  {dbPath}
                </code>
              </div>

              <div className="flex flex-wrap gap-2.5 pt-2">
                <button 
                  onClick={handleBackupDB}
                  className="btn-secondary h-8 px-3 text-xs flex items-center gap-1"
                >
                  <RefreshCw className="h-3 w-3" />
                  Backup DB File
                </button>
                
                <button 
                  onClick={handleClearHistory}
                  className="btn-destructive h-8 px-3 text-xs flex items-center gap-1"
                >
                  <Trash2 className="h-3 w-3" />
                  Clear All History
                </button>
              </div>
            </div>
          </div>

        </div>

        {/* Right 1/3 Custom Task Form Editor */}
        <div className="lg:col-span-1 p-5 rounded-xl bg-card border border-border shadow-sm flex flex-col justify-between h-fit space-y-5">
          <div>
            <h3 className="text-base font-bold">
              {editingTaskId ? 'Edit Custom Task' : 'Create Custom Evaluator'}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">Author custom prompts and validation rules.</p>
            
            <form onSubmit={handleSaveTask} className="mt-4 space-y-3.5 text-xs">
              
              <div className="space-y-1">
                <label className="text-muted-foreground font-semibold">Task Name</label>
                <input 
                  type="text" 
                  placeholder="e.g. JSON Parsing test"
                  value={taskName}
                  onChange={(e) => setTaskName(e.target.value)}
                  className="form-input text-xs h-8"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-muted-foreground font-semibold">Category</label>
                  <select 
                    value={taskCategory}
                    onChange={(e) => setTaskCategory(e.target.value as any)}
                    className="form-input text-xs h-8 py-0"
                  >
                    <option value="speed">Speed</option>
                    <option value="reasoning">Reasoning</option>
                    <option value="coding">Coding</option>
                    <option value="instruction">Instruction</option>
                    <option value="context">Context</option>
                    <option value="creative">Creative</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-muted-foreground font-semibold">Scorer Type</label>
                  <select 
                    value={taskScorer}
                    onChange={(e) => setTaskScorer(e.target.value)}
                    className="form-input text-xs h-8 py-0"
                  >
                    <option value="contains">Contains Scorer</option>
                    <option value="exact">Exact Scorer</option>
                    <option value="regex">Regex Scorer</option>
                    <option value="numeric">Numeric Scorer</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-muted-foreground font-semibold">System Instructions (Optional)</label>
                <textarea 
                  placeholder="e.g. You are a code generator."
                  value={taskSystemPrompt}
                  onChange={(e) => setTaskSystemPrompt(e.target.value)}
                  className="form-input text-xs h-12 py-1.5 resize-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-muted-foreground font-semibold">User prompt</label>
                <textarea 
                  placeholder="e.g. Write a palindrome check function..."
                  value={taskPrompt}
                  onChange={(e) => setTaskPrompt(e.target.value)}
                  className="form-input text-xs h-20 py-1.5"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-muted-foreground font-semibold">Temperature</label>
                  <input 
                    type="number" 
                    min="0.0" 
                    max="1.0" 
                    step="0.1"
                    value={taskTemp}
                    onChange={(e) => setTaskTemp(parseFloat(e.target.value) || 0)}
                    className="form-input text-xs h-8 font-semibold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-muted-foreground font-semibold">Max Tokens</label>
                  <input 
                    type="number" 
                    min="64" 
                    max="8192" 
                    value={taskMaxTokens}
                    onChange={(e) => setTaskMaxTokens(parseInt(e.target.value) || 256)}
                    className="form-input text-xs h-8 font-semibold"
                  />
                  <div className="flex flex-wrap gap-1 mt-1">
                    {[128, 256, 512, 1024].map(preset => (
                      <button
                        type="button"
                        key={preset}
                        onClick={() => setTaskMaxTokens(preset)}
                        className={`px-1 py-0.5 rounded text-[9px] font-bold border transition-all duration-155 ${
                          taskMaxTokens === preset
                            ? 'bg-primary/15 border-primary/30 text-primary shadow-sm'
                            : 'bg-secondary/40 border-border/85 text-muted-foreground hover:bg-secondary hover:text-foreground'
                        }`}
                      >
                        {preset === 1024 ? '1K' : preset}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-muted-foreground font-semibold">Expected Verification Output (e.g. keywords)</label>
                <input 
                  type="text" 
                  placeholder="e.g. assert, palindrome, def"
                  value={taskExpected}
                  onChange={(e) => setTaskExpected(e.target.value)}
                  className="form-input text-xs h-8"
                />
              </div>

              <button 
                type="submit" 
                className="w-full btn-primary h-9 text-xs flex items-center justify-center gap-1.5 mt-4"
              >
                <Check className="h-4 w-4" />
                {editingTaskId ? 'Update task' : 'Add custom task'}
              </button>
            </form>
          </div>
        </div>

      </div>

      {/* Custom tasks list */}
      {settings.customTasks.length > 0 && (
        <div className="p-5 rounded-xl bg-card border border-border shadow-sm space-y-4">
          <h3 className="text-sm font-bold uppercase text-muted-foreground tracking-wider mb-2">Your Custom Tasks</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
            {settings.customTasks.map(t => (
              <div key={t.id} className="p-4 rounded-lg bg-secondary/35 border border-border flex flex-col justify-between h-40">
                <div>
                  <div className="flex justify-between items-start gap-2">
                    <h4 className="font-bold text-foreground truncate max-w-[150px]">{t.name}</h4>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-primary/10 text-primary uppercase shrink-0">
                      {t.category}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1 truncate leading-snug">{t.prompt}</p>
                  <span className="text-[9px] text-muted-foreground/80 font-bold block mt-2.5">
                    Scorer: {t.scorerType} | Output: {t.expectedOutput ?? 'None'}
                  </span>
                </div>

                <div className="flex justify-end gap-2 border-t border-border/50 pt-2.5 mt-4">
                  <button 
                    onClick={() => handleEditTask(t)}
                    className="p-1 rounded text-primary hover:bg-primary/10"
                    title="Edit custom task"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button 
                    onClick={() => settings.deleteCustomTask(t.id)}
                    className="p-1 rounded text-red-500 hover:bg-red-500/10"
                    title="Delete custom task"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Clear History Confirm Modal */}
      <ConfirmModal
        isOpen={showClearConfirm}
        title="Clear All History"
        message="Are you sure you want to clear all benchmark run history? This will empty your SQLite database tables. Discovered models cache will remain."
        confirmLabel="Clear All"
        variant="danger"
        onConfirm={executeClearHistory}
        onCancel={() => setShowClearConfirm(false)}
      />
    </div>
  );
}
