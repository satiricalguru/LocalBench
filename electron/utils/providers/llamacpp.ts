import { OpenAICompatibleProvider } from './openai-compatible';
import { ModelInfo, fetchWithTimeout } from './base';

export class LlamaCppProvider extends OpenAICompatibleProvider {
  constructor(baseUrl = "http://localhost:8080") {
    super("llama.cpp", baseUrl);
  }

  async isAvailable(): Promise<boolean> {
    try {
      // llama.cpp health can check /props, /health, or /v1/models
      const res = await fetchWithTimeout(`${this.baseUrl}/props`, { timeoutMs: 3000 });
      if (res.status === 200) return true;
    } catch {
      // Fallback
    }
    return super.isAvailable();
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      // 1. Try llama.cpp native props endpoint
      const res = await fetchWithTimeout(`${this.baseUrl}/props`, { timeoutMs: 3000 });
      if (res.ok) {
        const data = await res.json() as any;
        const filePath = data.file ?? "llama.cpp model";
        // Extract file name from path
        const modelName = filePath.split(/[/\\]/).pop() ?? filePath;
        
        let sizeB: number | undefined;
        const sizeMatch = modelName.match(/(\d+)([bB])/);
        if (sizeMatch) sizeB = parseFloat(sizeMatch[1]);

        let quantization: string | undefined;
        const quantMatch = modelName.match(/(Q\d+_[K_][M|S|L|i]|\bFP16\b|\bBF16\b)/i);
        if (quantMatch) quantization = quantMatch[1].toUpperCase();

        const contextLength = data.default_generation_settings?.n_ctx ?? 2048;

        return [{
          id: "llama.cpp-default",
          name: modelName,
          provider: this.name,
          size: sizeB,
          quantization,
          family: modelName.toLowerCase().includes("llama") ? "llama" : "other",
          contextLength
        }];
      }
    } catch (e) {
      // Fallback
    }

    // 2. Fallback to standard OpenAI compatible listing
    return super.listModels();
  }
}
