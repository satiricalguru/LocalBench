import { create } from 'zustand';
import type { BenchmarkTask } from '../types';

interface SettingsState {
  concurrency: number;
  defaultTimeout: number; // seconds
  defaultTemperature: number;
  defaultMaxTokens: number;
  weights: {
    quality: number; // 0 - 100
    speed: number;   // 0 - 100
    ttft: number;    // 0 - 100
  };
  customTasks: BenchmarkTask[];
  apiKeys: {
    openai?: string;
    anthropic?: string;
    gemini?: string;
    openrouter?: string;
  };
  setConcurrency: (val: number) => void;
  setDefaultTimeout: (val: number) => void;
  setTemperature: (val: number) => void;
  setMaxTokens: (val: number) => void;
  setWeights: (weights: { quality: number; speed: number; ttft: number }) => void;
  addCustomTask: (task: BenchmarkTask) => void;
  updateCustomTask: (id: string, task: BenchmarkTask) => void;
  deleteCustomTask: (id: string) => void;
  setApiKeys: (keys: { openai?: string; anthropic?: string; gemini?: string; openrouter?: string }) => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => {
  // Load configuration from localstorage
  const loadSaved = () => {
    try {
      const saved = localStorage.getItem('localbench_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          concurrency: parsed.concurrency ?? 1,
          defaultTimeout: parsed.defaultTimeout ?? 120,
          defaultTemperature: parsed.defaultTemperature ?? 0.0,
          defaultMaxTokens: parsed.defaultMaxTokens ?? 512,
          weights: parsed.weights ?? { quality: 60, speed: 25, ttft: 15 },
          customTasks: parsed.customTasks ?? [],
          apiKeys: parsed.apiKeys ?? {}
        };
      }
    } catch {
      // Fallback to default
    }
    return {
      concurrency: 1,
      defaultTimeout: 120,
      defaultTemperature: 0.0,
      defaultMaxTokens: 512,
      weights: { quality: 60, speed: 25, ttft: 15 },
      customTasks: [],
      apiKeys: {}
    };
  };

  const saveSettings = (state: Partial<SettingsState>) => {
    try {
      const current = get();
      const payload = {
        concurrency: state.concurrency ?? current.concurrency,
        defaultTimeout: state.defaultTimeout ?? current.defaultTimeout,
        defaultTemperature: state.defaultTemperature ?? current.defaultTemperature,
        defaultMaxTokens: state.defaultMaxTokens ?? current.defaultMaxTokens,
        weights: state.weights ?? current.weights,
        customTasks: state.customTasks ?? current.customTasks,
        apiKeys: state.apiKeys ?? current.apiKeys
      };
      localStorage.setItem('localbench_settings', JSON.stringify(payload));
    } catch (err) {
      console.error("Failed to save settings:", err);
    }
  };

  const initial = loadSaved();

  return {
    ...initial,

    setConcurrency: (val: number) => {
      set({ concurrency: val });
      saveSettings({ concurrency: val });
    },

    setDefaultTimeout: (val: number) => {
      set({ defaultTimeout: val });
      saveSettings({ defaultTimeout: val });
    },

    setTemperature: (val: number) => {
      set({ defaultTemperature: val });
      saveSettings({ defaultTemperature: val });
    },

    setMaxTokens: (val: number) => {
      set({ defaultMaxTokens: val });
      saveSettings({ defaultMaxTokens: val });
    },

    setWeights: (weights) => {
      set({ weights });
      saveSettings({ weights });
    },

    addCustomTask: (task: BenchmarkTask) => {
      const updated = [...get().customTasks, task];
      set({ customTasks: updated });
      saveSettings({ customTasks: updated });
    },

    updateCustomTask: (id: string, task: BenchmarkTask) => {
      const updated = get().customTasks.map(t => t.id === id ? task : t);
      set({ customTasks: updated });
      saveSettings({ customTasks: updated });
    },

    deleteCustomTask: (id: string) => {
      const updated = get().customTasks.filter(t => t.id !== id);
      set({ customTasks: updated });
      saveSettings({ customTasks: updated });
    },
    
    setApiKeys: (keys) => {
      const merged = { ...get().apiKeys, ...keys };
      set({ apiKeys: merged });
      saveSettings({ apiKeys: merged });
    }
  };
});
