import { useState, useEffect, lazy, Suspense } from 'react';
import { useProvidersStore } from './store/providersStore';
import { useBenchmarkStore } from './store/benchmarkStore';
import ErrorBoundary from './components/ErrorBoundary';
import ToastContainer from './components/Toast';
import { 
  LayoutDashboard, Trophy, Play, History as HistoryIcon, 
  Cpu, Settings as SettingsIcon, Sun, Moon, RefreshCw, AlertCircle, BrainCircuit, MessageSquare, Scale
} from 'lucide-react';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Leaderboard = lazy(() => import('./pages/Leaderboard'));
const RunBenchmark = lazy(() => import('./pages/RunBenchmark'));
const Results = lazy(() => import('./pages/Results'));
const History = lazy(() => import('./pages/History'));
const ProvidersPage = lazy(() => import('./pages/ProvidersPage'));
const Settings = lazy(() => import('./pages/Settings'));
const HardwareMatchmaker = lazy(() => import('./pages/HardwareMatchmaker'));
const Playground = lazy(() => import('./pages/Playground'));
const Compare = lazy(() => import('./pages/Compare'));

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'leaderboard' | 'run' | 'results' | 'history' | 'providers' | 'settings' | 'matchmaker' | 'playground' | 'compare'>('dashboard');
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  const { loadProviders, loadSystemInfo, providers, isDiscovering } = useProvidersStore();
  const { status, progress, cancelBenchmark } = useBenchmarkStore();

  // Load configuration on mount
  useEffect(() => {
    loadProviders();
    loadSystemInfo();

    // Sync theme
    const savedTheme = localStorage.getItem('localbench_theme') as 'dark' | 'light' | null;
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.classList.toggle('dark', savedTheme === 'dark');
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setTheme(prefersDark ? 'dark' : 'light');
      document.documentElement.classList.toggle('dark', prefersDark);
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('localbench_theme', nextTheme);
    document.documentElement.classList.toggle('dark', nextTheme === 'dark');
  };

  const navigateToResults = (runId: string) => {
    setSelectedRunId(runId);
    setActiveTab('results');
  };

  const renderActivePage = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <Dashboard 
            onNavigateToRun={() => setActiveTab('run')} 
            onNavigateToResults={navigateToResults} 
            onNavigateToProviders={() => setActiveTab('providers')}
          />
        );
      case 'leaderboard':
        return <Leaderboard onNavigateToResults={navigateToResults} />;
      case 'run':
        return <RunBenchmark onBenchmarkFinished={navigateToResults} />;
      case 'results':
        return <Results runId={selectedRunId} onBackToHistory={() => setActiveTab('history')} />;
      case 'history':
        return <History onNavigateToResults={navigateToResults} />;
      case 'providers':
        return <ProvidersPage />;
      case 'settings':
        return <Settings />;
      case 'matchmaker':
        return <HardwareMatchmaker />;
      case 'playground':
        return <Playground />;
      case 'compare':
        return <Compare />;
      default:
        return <Dashboard onNavigateToRun={() => setActiveTab('run')} onNavigateToResults={navigateToResults} onNavigateToProviders={() => setActiveTab('providers')} />;
    }
  };

  const activeProvidersCount = providers.filter(p => p.isConnected).length;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground font-sans transition-colors duration-200">
      
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-card border-r border-border flex flex-col justify-between select-none">
        <div>
          {/* Logo */}
          <div className="h-16 px-6 flex items-center border-b border-border gap-2.5">
            <img src="/icon.png" className="h-8 w-8 rounded-lg shadow-md shadow-primary/10 object-contain" alt="LocalBench logo" />
            <div>
              <h1 className="font-bold text-base tracking-tight leading-none">LocalBench</h1>
              <span className="text-[10px] font-semibold text-muted-foreground tracking-wide uppercase">Local LLM Testing</span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-4 space-y-1.5">
            {[
              { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
              { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
              { id: 'run', label: 'Run Benchmark', icon: Play },
              { id: 'playground', label: 'Model Playground', icon: MessageSquare },
              { id: 'compare', label: 'Model Compare', icon: Scale },
              { id: 'matchmaker', label: 'Hardware Matchmaker', icon: BrainCircuit },
              { id: 'history', label: 'Run History', icon: HistoryIcon },
              { id: 'providers', label: 'LLM Providers', icon: Cpu },
              { id: 'settings', label: 'Settings', icon: SettingsIcon },
            ].map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id || (item.id === 'history' && activeTab === 'results');
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    if (status === 'running' && item.id !== activeTab) {
                      // Warn before navigating away if benchmark is running, but let them do it
                    }
                    setActiveTab(item.id as any);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all group duration-150 ${
                    isActive 
                      ? 'bg-primary text-primary-foreground shadow-md shadow-primary/10' 
                      : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                  }`}
                >
                  <Icon className={`h-4 w-4 transition-transform group-hover:scale-110 duration-150`} />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-border bg-secondary/30 space-y-3">
          {/* Connection Status strip */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground font-medium">Providers Detected:</span>
            <div className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${activeProvidersCount > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
              <span className="font-semibold">{activeProvidersCount} / {providers.length}</span>
            </div>
          </div>

          {/* Refresh and Theme Toggles */}
          <div className="flex gap-2">
            <button 
              onClick={toggleTheme}
              className="flex-1 btn-secondary h-8 px-2 flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              title="Toggle Dark/Light Mode"
            >
              {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
              Theme
            </button>
            <button 
              onClick={loadProviders}
              disabled={isDiscovering}
              className="flex-1 btn-secondary h-8 px-2 flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
              title="Scan Local Hosts"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isDiscovering ? 'animate-spin' : ''}`} />
              Rescan
            </button>
          </div>
        </div>
      </aside>

      {/* Main Area */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {/* Active Benchmark Status Bar Banner */}
        {status === 'running' && (
          <div className="bg-primary/10 border-b border-primary/20 h-11 px-6 flex items-center justify-between shrink-0 select-none animate-pulse-slow">
            <div className="flex items-center gap-2 text-xs font-semibold text-primary">
              <AlertCircle className="h-4 w-4 animate-spin" />
              <span>Running local benchmark suite... ({progress}%)</span>
            </div>
            <button 
              onClick={cancelBenchmark}
              className="text-xs font-bold text-red-500 hover:text-red-400 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20 transition-colors"
            >
              Cancel Run
            </button>
          </div>
        )}

        {/* Page content wrapper */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 relative">
          <div className="max-w-7xl mx-auto space-y-6 animate-fade-in-up">
            <ErrorBoundary>
              <Suspense fallback={
                <div className="flex items-center justify-center py-20 text-muted-foreground">
                  <RefreshCw className="h-6 w-6 animate-spin" />
                </div>
              }>
                {renderActivePage()}
              </Suspense>
            </ErrorBoundary>
          </div>
        </div>
        <ToastContainer />
      </main>
    </div>
  );
}
