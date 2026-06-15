import { LLMProvider, ModelInfo, ChatParams, ChatResponse, StreamChunk, fetchWithTimeout } from './base';

export class OpenAICompatibleProvider implements LLMProvider {
  name: string;
  baseUrl: string;
  apiKey?: string;

  constructor(name: string, baseUrl: string, apiKey?: string) {
    this.name = name;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const headers: Record<string, string> = {};
      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }
      // Wrap availability in 5s timeout
      const res = await fetchWithTimeout(`${this.baseUrl}/v1/models`, { 
        timeoutMs: 3000,
        headers
      });
      return res.status === 200;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const headers: Record<string, string> = {};
      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }
      const res = await fetchWithTimeout(`${this.baseUrl}/v1/models`, { 
        timeoutMs: 5000,
        headers
      });
      if (!res.ok) return [];
      const data = await res.json() as { data?: any[] };
      const models = data.data ?? [];

      return models.map((m: any) => {
        // Infer family from ID if possible
        const id = m.id;
        let family = "other";
        if (id.toLowerCase().includes("llama")) family = "llama";
        else if (id.toLowerCase().includes("mistral")) family = "mistral";
        else if (id.toLowerCase().includes("qwen")) family = "qwen";
        else if (id.toLowerCase().includes("gemma")) family = "gemma";
        else if (id.toLowerCase().includes("phi")) family = "phi";

        // Try to parse quantization and size from ID
        let size: number | undefined;
        const sizeMatch = id.match(/(\d+)([bB])/);
        if (sizeMatch) {
          size = parseFloat(sizeMatch[1]);
        }

        let quantization: string | undefined;
        const quantMatch = id.match(/(Q\d+_[K_][M|S|L|i]|\bFP16\b|\bBF16\b)/i);
        if (quantMatch) {
          quantization = quantMatch[1].toUpperCase();
        }

        let modifiedAt: string | undefined;
        if (m.created !== undefined && m.created !== null) {
          try {
            const num = Number(m.created);
            if (!isNaN(num)) {
              modifiedAt = new Date(num * 1000).toISOString();
            } else {
              const parsed = Date.parse(String(m.created));
              if (!isNaN(parsed)) {
                modifiedAt = new Date(parsed).toISOString();
              }
            }
          } catch {
            // Ignore date parsing error
          }
        }

        return {
          id: m.id,
          name: m.id,
          provider: this.name,
          size,
          quantization,
          family,
          modifiedAt,
          contextLength: 4096 // Default fallback
        };
      });
    } catch (err) {
      console.error(`${this.name} listModels error:`, err);
      return [];
    }
  }

  async chat(params: ChatParams, signal?: AbortSignal): Promise<ChatResponse> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: params.model,
        messages: params.messages,
        temperature: params.temperature ?? 0.0,
        max_tokens: params.maxTokens ?? 512,
        stream: false
      }),
      signal
    });

    if (!res.ok) {
      throw new Error(`${this.name} chat failed with status ${res.status}: ${res.statusText}`);
    }

    const data = await res.json() as any;
    return {
      content: data.choices?.[0]?.message?.content ?? "",
      promptTokens: data.usage?.prompt_tokens ?? undefined,
      completionTokens: data.usage?.completion_tokens ?? undefined
    };
  }

  async *chatStream(params: ChatParams, signal?: AbortSignal): AsyncGenerator<StreamChunk, void, unknown> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: params.model,
        messages: params.messages,
        temperature: params.temperature ?? 0.0,
        max_tokens: params.maxTokens ?? 512,
        stream: true
      }),
      signal
    });

    if (!res.ok) {
      throw new Error(`${this.name} chatStream failed with status ${res.status}: ${res.statusText}`);
    }

    const reader = res.body;
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = '';

    for await (const chunk of reader as any) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (!trimmed.startsWith("data: ")) continue;

        const dataStr = trimmed.slice(6).trim();
        if (dataStr === "[DONE]") {
          yield { content: "", done: true };
          return;
        }

        try {
          const json = JSON.parse(dataStr);
          const choice = json.choices?.[0];
          const content = choice?.delta?.content ?? "";
          const promptTokens = json.usage?.prompt_tokens ?? undefined;
          const completionTokens = json.usage?.completion_tokens ?? undefined;

          yield {
            content,
            promptTokens,
            completionTokens,
            done: choice?.finish_reason != null
          };
        } catch (e) {
          // ignore parsing error for comments or partial stream packets
        }
      }
    }
  }
}
