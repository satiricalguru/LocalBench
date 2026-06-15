import { OpenAICompatibleProvider } from './openai-compatible';
import { ModelInfo, fetchWithTimeout } from './base';

export class LMStudioProvider extends OpenAICompatibleProvider {
  constructor(baseUrl = "http://localhost:1234") {
    super("LM Studio", baseUrl);
  }

  // Native API might provide richer metadata
  async listModels(): Promise<ModelInfo[]> {
    try {
      // 1. Try native v0 api first
      const res = await fetchWithTimeout(`${this.baseUrl}/api/v0/models`, { timeoutMs: 3000 });
      if (res.ok) {
        const data = await res.json() as any;
        const models = data.data ?? data.models ?? [];
        if (models.length > 0) {
          return models.map((m: any) => {
            const id = m.id ?? m.name;
            let sizeB: number | undefined;
            if (m.size) {
              sizeB = typeof m.size === 'number' ? m.size : parseFloat(m.size);
            } else {
              const sizeMatch = id.match(/(\d+)([bB])/);
              if (sizeMatch) sizeB = parseFloat(sizeMatch[1]);
            }

            return {
              id: id,
              name: m.name ?? id,
              provider: this.name,
              size: sizeB,
              quantization: m.quantization ?? undefined,
              family: m.family ?? undefined,
              contextLength: m.context_length ?? 4096,
              sizeOnDisk: m.size_bytes ?? undefined
            };
          });
        }
      }
    } catch (e) {
      // Fallback to OpenAI listModels
    }

    // 2. Fallback to standard OpenAI compatible listing
    return super.listModels();
  }
}
