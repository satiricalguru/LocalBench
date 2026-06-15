import { LLMProvider, ModelInfo, ChatParams, ChatResponse, StreamChunk, fetchWithTimeout } from './base';

export class OllamaProvider implements LLMProvider {
  name = "Ollama";
  baseUrl: string;

  constructor(baseUrl = "http://localhost:11434") {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetchWithTimeout(this.baseUrl, { timeoutMs: 3000 });
      const text = await res.text();
      return text.includes("Ollama is running");
    } catch {
      return false;
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const res = await fetchWithTimeout(`${this.baseUrl}/api/tags`, { timeoutMs: 5000 });
      if (!res.ok) return [];
      const data = await res.json() as { models?: any[] };
      const models = data.models ?? [];

      const results: ModelInfo[] = [];

      for (const m of models) {
        let sizeB: number | undefined;
        if (m.details?.parameter_size) {
          const raw = m.details.parameter_size;
          // E.g., "7B", "7.2B", "70B"
          const match = raw.match(/([\d.]+)/);
          if (match) {
            sizeB = parseFloat(match[1]);
          }
        }

        results.push({
          id: m.name,
          name: m.name,
          provider: this.name,
          size: sizeB,
          quantization: m.details?.quantization_level ?? undefined,
          family: m.details?.family ?? undefined,
          modifiedAt: m.modified_at,
          sizeOnDisk: m.size,
          contextLength: 2048 // Ollama default; can override if needed
        });
      }

      return results;
    } catch (err) {
      console.error("Ollama listModels error:", err);
      return [];
    }
  }

  async chat(params: ChatParams, signal?: AbortSignal): Promise<ChatResponse> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: params.model,
        messages: params.messages,
        options: {
          temperature: params.temperature ?? 0.0,
          num_predict: params.maxTokens ?? 512,
        },
        stream: false
      }),
      signal
    });

    if (!res.ok) {
      throw new Error(`Ollama chat failed with status ${res.status}: ${res.statusText}`);
    }

    const data = await res.json() as any;
    return {
      content: data.message?.content ?? "",
      promptTokens: data.prompt_eval_count ?? undefined,
      completionTokens: data.eval_count ?? undefined
    };
  }

  async *chatStream(params: ChatParams, signal?: AbortSignal): AsyncGenerator<StreamChunk, void, unknown> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: params.model,
        messages: params.messages,
        options: {
          temperature: params.temperature ?? 0.0,
          num_predict: params.maxTokens ?? 512,
        },
        stream: true
      }),
      signal
    });

    if (!res.ok) {
      throw new Error(`Ollama chatStream failed with status ${res.status}: ${res.statusText}`);
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
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line);
          yield {
            content: data.message?.content ?? "",
            promptTokens: data.prompt_eval_count ?? undefined,
            completionTokens: data.eval_count ?? undefined,
            done: data.done === true
          };
        } catch (e) {
          console.error("Error parsing NDJSON chunk from Ollama:", e, "Line was:", line);
        }
      }
    }
  }
}
