import { LLMProvider, ModelInfo, ChatParams, ChatResponse, StreamChunk } from './base';

export class AnthropicProvider implements LLMProvider {
  name = "Anthropic";
  baseUrl = "https://api.anthropic.com";
  apiKey?: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey;
  }

  async listModels(): Promise<ModelInfo[]> {
    return [
      { id: "claude-3-5-sonnet-latest", name: "Claude 3.5 Sonnet", provider: this.name, contextLength: 200000 },
      { id: "claude-3-5-haiku-latest", name: "Claude 3.5 Haiku", provider: this.name, contextLength: 200000 },
      { id: "claude-3-opus-latest", name: "Claude 3 Opus", provider: this.name, contextLength: 200000 }
    ];
  }

  async chat(params: ChatParams, signal?: AbortSignal): Promise<ChatResponse> {
    const systemMessage = params.messages.find(m => m.role === 'system')?.content;
    const userAndAssistantMessages = params.messages.filter(m => m.role !== 'system');

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey ?? '',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: params.model,
        messages: userAndAssistantMessages,
        ...(systemMessage ? { system: systemMessage } : {}),
        max_tokens: params.maxTokens ?? 512,
        temperature: params.temperature ?? 0.0,
        stream: false
      }),
      signal
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      throw new Error(`Anthropic chat failed with status ${res.status}: ${res.statusText} ${errorText}`);
    }

    const data = await res.json() as any;
    const content = data.content?.[0]?.text ?? "";
    const promptTokens = data.usage?.input_tokens ?? undefined;
    const completionTokens = data.usage?.output_tokens ?? undefined;

    return { content, promptTokens, completionTokens };
  }

  async *chatStream(params: ChatParams, signal?: AbortSignal): AsyncGenerator<StreamChunk, void, unknown> {
    const systemMessage = params.messages.find(m => m.role === 'system')?.content;
    const userAndAssistantMessages = params.messages.filter(m => m.role !== 'system');

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey ?? '',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: params.model,
        messages: userAndAssistantMessages,
        ...(systemMessage ? { system: systemMessage } : {}),
        max_tokens: params.maxTokens ?? 512,
        temperature: params.temperature ?? 0.0,
        stream: true
      }),
      signal
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      throw new Error(`Anthropic chatStream failed with status ${res.status}: ${res.statusText} ${errorText}`);
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
        try {
          const json = JSON.parse(dataStr);
          if (json.type === "content_block_delta" && json.delta?.type === "text_delta") {
            yield {
              content: json.delta.text ?? "",
              done: false
            };
          } else if (json.type === "message_delta") {
            const completionTokens = json.usage?.output_tokens ?? undefined;
            yield {
              content: "",
              completionTokens,
              done: false
            };
          } else if (json.type === "message_stop") {
            yield {
              content: "",
              done: true
            };
            return;
          }
        } catch (e) {
          // ignore parsing error
        }
      }
    }
  }
}
