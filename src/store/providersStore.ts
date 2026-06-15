import { create } from 'zustand';
import type { ProviderStatus, ModelInfo, SystemInfo } from '../types';
import { useSettingsStore } from './settingsStore';

const getCloudModelsAndProviders = (apiKeys: any) => {
  const cloudProviders: ProviderStatus[] = [];
  const cloudModels: ModelInfo[] = [];

  if (apiKeys.openai) {
    const models = [
      { id: "gpt-4o", name: "GPT-4o", provider: "OpenAI", contextLength: 128000 },
      { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "OpenAI", contextLength: 128000 },
      { id: "gpt-4-turbo", name: "GPT-4 Turbo", provider: "OpenAI", contextLength: 128000 }
    ];
    cloudProviders.push({
      name: "OpenAI",
      url: "https://api.openai.com",
      isConnected: true,
      modelCount: models.length
    });
    cloudModels.push(...models);
  }

  if (apiKeys.anthropic) {
    const models = [
      { id: "claude-3-5-sonnet-latest", name: "Claude 3.5 Sonnet", provider: "Anthropic", contextLength: 200000 },
      { id: "claude-3-5-haiku-latest", name: "Claude 3.5 Haiku", provider: "Anthropic", contextLength: 200000 },
      { id: "claude-3-opus-latest", name: "Claude 3 Opus", provider: "Anthropic", contextLength: 200000 }
    ];
    cloudProviders.push({
      name: "Anthropic",
      url: "https://api.anthropic.com",
      isConnected: true,
      modelCount: models.length
    });
    cloudModels.push(...models);
  }

  if (apiKeys.gemini) {
    const models = [
      { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", provider: "Gemini", contextLength: 1000000 },
      { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash", provider: "Gemini", contextLength: 1000000 }
    ];
    cloudProviders.push({
      name: "Gemini",
      url: "https://generativelanguage.googleapis.com/v1beta/openai",
      isConnected: true,
      modelCount: models.length
    });
    cloudModels.push(...models);
  }

  if (apiKeys.openrouter) {
    const models = [
      { id: "meta-llama/llama-3.1-70b-instruct", name: "Llama 3.1 70B (OpenRouter)", provider: "OpenRouter", contextLength: 131072 },
      { id: "deepseek/deepseek-chat", name: "DeepSeek V3 (OpenRouter)", provider: "OpenRouter", contextLength: 64000 },
      { id: "google/gemini-flash-1.5", name: "Gemini 1.5 Flash (OpenRouter)", provider: "OpenRouter", contextLength: 1000000 }
    ];
    cloudProviders.push({
      name: "OpenRouter",
      url: "https://openrouter.ai",
      isConnected: true,
      modelCount: models.length
    });
    cloudModels.push(...models);
  }

  return { cloudProviders, cloudModels };
};

interface ProvidersState {
  providers: ProviderStatus[];
  models: ModelInfo[];
  customProviders: Array<{ name: string; url: string }>;
  systemInfo: SystemInfo | null;
  isLoading: boolean;
  isDiscovering: boolean;
  loadProviders: () => Promise<void>;
  refreshModels: () => Promise<void>;
  addCustomProvider: (name: string, url: string) => Promise<boolean>;
  removeCustomProvider: (url: string) => void;
  loadSystemInfo: () => Promise<void>;
}

export const useProvidersStore = create<ProvidersState>((set, get) => {
  // Load custom providers from localstorage initially
  const initialCustomProviders = (() => {
    try {
      const saved = localStorage.getItem('localbench_custom_providers');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  })();

  return {
    providers: [],
    models: [],
    customProviders: initialCustomProviders,
    systemInfo: null,
    isLoading: false,
    isDiscovering: false,

    loadProviders: async () => {
      set({ isDiscovering: true });
      try {
        // 1. Discover standard providers
        const discovered = await window.electronAPI.discoverProviders();

        // 2. Discover custom providers if any
        const customProvs = get().customProviders;
        const customResults = await Promise.all(
          customProvs.map(async (cp) => {
            const isConnected = await window.electronAPI.testProvider(cp.name, cp.url);
            // Count models in SQLite database for this custom provider if connected
            let modelCount = 0;
            if (isConnected) {
              const allModels = await window.electronAPI.getModels(cp.name);
              modelCount = allModels.length;
            }
            return {
              name: cp.name,
              url: cp.url,
              isConnected,
              modelCount
            };
          })
        );

        const apiKeys = useSettingsStore.getState().apiKeys;
        const { cloudProviders, cloudModels } = getCloudModelsAndProviders(apiKeys);

        const mergedProviders = [...discovered, ...customResults, ...cloudProviders];
        
        // 3. Fetch all models from SQLite cache
        const allModels = await window.electronAPI.getModels();
        const mergedModels = [...allModels, ...cloudModels];

        set({ providers: mergedProviders, models: mergedModels });
      } catch (err) {
        console.error("Failed to load providers:", err);
      } finally {
        set({ isDiscovering: false });
      }
    },

    refreshModels: async () => {
      set({ isLoading: true });
      try {
        const apiKeys = useSettingsStore.getState().apiKeys;
        const { cloudModels } = getCloudModelsAndProviders(apiKeys);
        const allModels = await window.electronAPI.getModels();
        set({ models: [...allModels, ...cloudModels] });
      } catch (err) {
        console.error("Failed to refresh models:", err);
      } finally {
        set({ isLoading: false });
      }
    },

    addCustomProvider: async (name: string, url: string) => {
      set({ isLoading: true });
      try {
        const isConnected = await window.electronAPI.testProvider(name, url);
        
        const updatedCustom = [...get().customProviders, { name, url }];
        localStorage.setItem('localbench_custom_providers', JSON.stringify(updatedCustom));
        set({ customProviders: updatedCustom });

        // Reload to update list
        await get().loadProviders();
        return isConnected;
      } catch (err) {
        console.error("Failed to add custom provider:", err);
        return false;
      } finally {
        set({ isLoading: false });
      }
    },

    removeCustomProvider: async (url: string) => {
      const updatedCustom = get().customProviders.filter(cp => cp.url !== url);
      localStorage.setItem('localbench_custom_providers', JSON.stringify(updatedCustom));
      set({ customProviders: updatedCustom });
      await get().loadProviders();
    },

    loadSystemInfo: async () => {
      try {
        const info = await window.electronAPI.getSystemInfo();
        set({ systemInfo: info });
      } catch (err) {
        console.error("Failed to load system info:", err);
      }
    }
  };
});
