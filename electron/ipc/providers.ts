import { ipcMain, app } from 'electron';
import fs from 'fs';
import path from 'path';
import { OllamaProvider } from '../utils/providers/ollama';
import { LMStudioProvider } from '../utils/providers/lmstudio';
import { JanProvider } from '../utils/providers/jan';
import { GPT4AllProvider } from '../utils/providers/gpt4all';
import { LlamaCppProvider } from '../utils/providers/llamacpp';
import { OpenAICompatibleProvider } from '../utils/providers/openai-compatible';
import { AnthropicProvider } from '../utils/providers/anthropic';
import { ModelInfo, LLMProvider } from '../utils/providers/base';
import { cacheModels, getCachedModels, pruneCachedModels } from '../utils/db';

const activePlaygroundChats = new Map<string, AbortController>();

// Simple error logger
function logProviderError(providerName: string, error: any) {
  try {
    const logsDir = app.getPath('logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    const logFilePath = path.join(logsDir, 'provider_errors.log');
    const timestamp = new Date().toISOString();
    const errorMessage = `${timestamp} - [${providerName}] ${error?.message ?? JSON.stringify(error)}\n`;
    fs.appendFileSync(logFilePath, errorMessage);
  } catch (e) {
    console.error("Failed to write to provider log file:", e);
  }
}

// Retry with exponential backoff helper
async function retryWithBackoff<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0) throw error;
    await new Promise(resolve => setTimeout(resolve, delay));
    return retryWithBackoff(fn, retries - 1, delay * 2);
  }
}

export interface ProviderStatus {
  name: string;
  url: string;
  isConnected: boolean;
  modelCount: number;
}

export function registerProvidersIPCHandlers() {
  // Discover local providers
  ipcMain.handle('discover-providers', async (): Promise<ProviderStatus[]> => {
    const defaultProviders = [
      { name: "Ollama", provider: new OllamaProvider("http://localhost:11434"), defaultUrl: "http://localhost:11434" },
      { name: "LM Studio", provider: new LMStudioProvider("http://localhost:1234"), defaultUrl: "http://localhost:1234" },
      { name: "Jan", provider: new JanProvider("http://localhost:1337"), defaultUrl: "http://localhost:1337" },
      { name: "GPT4All", provider: new GPT4AllProvider("http://localhost:4891"), defaultUrl: "http://localhost:4891" },
      { name: "llama.cpp", provider: new LlamaCppProvider("http://localhost:8080"), defaultUrl: "http://localhost:8080" }
    ];

    const results: ProviderStatus[] = [];

    const checks = defaultProviders.map(async ({ name, provider, defaultUrl }) => {
      const isAvailable = await provider.isAvailable();
      let modelCount = 0;

      if (isAvailable) {
        try {
          // Fetch models with 3 retries and cache them
          const models = await retryWithBackoff(async () => {
            const list = await provider.listModels();
            if (list.length === 0) {
              // LM Studio might be running but have no models loaded.
              // We don't throw an error, we just return empty array
              return [];
            }
            return list;
          }, 3, 1000);

          modelCount = models.length;

          // Prune cached models that are no longer installed on this provider
          pruneCachedModels(name, models.map(m => m.id));

          if (models.length > 0) {
            // Transform ModelInfo to cache shape
            const cacheItems = models.map(m => ({
              id: `${m.provider.toLowerCase()}:${m.id}`,
              provider: m.provider,
              model_id: m.id,
              display_name: m.name,
              size_b: m.size,
              quantization: m.quantization,
              family: m.family,
              context_len: m.contextLength,
              size_on_disk: m.sizeOnDisk,
              last_seen: Date.now()
            }));

            cacheModels(cacheItems);
          }
        } catch (err: any) {
          logProviderError(name, err);
          // If connection failed mid-listing, still mark as available but 0 models
        }
      }

      results.push({
        name,
        url: defaultUrl,
        isConnected: isAvailable,
        modelCount
      });
    });

    await Promise.all(checks);
    return results;
  });

  // Get models list (optionally filtered by provider)
  ipcMain.handle('get-models', async (_event, providerName?: string): Promise<ModelInfo[]> => {
    const cached = getCachedModels(providerName);
    
    // Filter out models older than 30 seconds (TTL cache refresh policy if requested)
    // Wait, the user can refresh on demand. We still return cached items.
    return cached.map(c => ({
      id: c.modelId,
      name: c.displayName ?? c.modelId,
      provider: c.provider,
      size: c.sizeB ?? undefined,
      quantization: c.quantization ?? undefined,
      family: c.family ?? undefined,
      contextLength: c.contextLen ?? undefined,
      sizeOnDisk: c.sizeOnDisk ?? undefined
    }));
  });

  // Test custom provider connection and query models
  ipcMain.handle('test-provider', async (_event, name: string, url: string): Promise<boolean> => {
    let provider: LLMProvider;
    
    switch (name) {
      case "Ollama":
        provider = new OllamaProvider(url);
        break;
      case "LM Studio":
        provider = new LMStudioProvider(url);
        break;
      case "Jan":
        provider = new JanProvider(url);
        break;
      case "GPT4All":
        provider = new GPT4AllProvider(url);
        break;
      case "llama.cpp":
        provider = new LlamaCppProvider(url);
        break;
      default:
        provider = new OpenAICompatibleProvider(name, url);
    }

    try {
      const isAvailable = await provider.isAvailable();
      if (!isAvailable) return false;

      // If available, attempt to list and cache models
      const models = await provider.listModels();
      
      // Prune cached models that are no longer installed on this provider
      pruneCachedModels(name, models.map(m => m.id));

      if (models.length > 0) {
        const cacheItems = models.map(m => ({
          id: `${m.provider.toLowerCase()}:${m.id}`,
          provider: m.provider,
          model_id: m.id,
          display_name: m.name,
          size_b: m.size,
          quantization: m.quantization,
          family: m.family,
          context_len: m.contextLength,
          size_on_disk: m.sizeOnDisk,
          last_seen: Date.now()
        }));
        cacheModels(cacheItems);
      }
      return true;
    } catch (err: any) {
      logProviderError(name, err);
      return false;
    }
  });

  // Streaming chat for playground
  ipcMain.handle('playground-chat', async (
    event,
    { providerName, url, modelId, messages, temperature, maxTokens, streamId, apiKeys }
  ): Promise<boolean> => {
    if (activePlaygroundChats.has(streamId)) {
      activePlaygroundChats.get(streamId)!.abort();
      activePlaygroundChats.delete(streamId);
    }

    const controller = new AbortController();
    activePlaygroundChats.set(streamId, controller);

    try {
      let provider: LLMProvider;
      switch (providerName) {
        case "Ollama":
          provider = new OllamaProvider(url);
          break;
        case "LM Studio":
          provider = new LMStudioProvider(url);
          break;
        case "Jan":
          provider = new JanProvider(url);
          break;
        case "GPT4All":
          provider = new GPT4AllProvider(url);
          break;
        case "llama.cpp":
          provider = new LlamaCppProvider(url);
          break;
        case "OpenAI":
          provider = new OpenAICompatibleProvider("OpenAI", "https://api.openai.com", apiKeys?.openai);
          break;
        case "Gemini":
          provider = new OpenAICompatibleProvider("Gemini", "https://generativelanguage.googleapis.com/v1beta/openai", apiKeys?.gemini);
          break;
        case "OpenRouter":
          provider = new OpenAICompatibleProvider("OpenRouter", "https://openrouter.ai", apiKeys?.openrouter);
          break;
        case "Anthropic":
          provider = new AnthropicProvider(apiKeys?.anthropic);
          break;
        default:
          provider = new OpenAICompatibleProvider(providerName, url ?? "http://localhost:8080");
      }

      const stream = provider.chatStream(
        {
          model: modelId,
          messages,
          temperature,
          maxTokens
        },
        controller.signal
      );

      for await (const chunk of stream) {
        if (event.sender.isDestroyed()) {
          activePlaygroundChats.delete(streamId);
          return false;
        }
        event.sender.send('playground-token', {
          streamId,
          content: chunk.content,
          done: chunk.done === true
        });
      }

      activePlaygroundChats.delete(streamId);
      return true;
    } catch (err: any) {
      activePlaygroundChats.delete(streamId);
      if (controller.signal.aborted) {
        if (!event.sender.isDestroyed()) {
          event.sender.send('playground-token', {
            streamId,
            content: '',
            done: true,
            error: 'CANCELLED'
          });
        }
      } else {
        console.error(`Playground chat error on model ${modelId}:`, err);
        if (!event.sender.isDestroyed()) {
          event.sender.send('playground-token', {
            streamId,
            content: '',
            done: true,
            error: err?.message ?? 'Error occurred'
          });
        }
      }
      return false;
    }
  });

  ipcMain.handle('playground-cancel', async (_event, streamId: string): Promise<void> => {
    const controller = activePlaygroundChats.get(streamId);
    if (controller) {
      controller.abort();
      activePlaygroundChats.delete(streamId);
    }
  });
}
