export interface ModelInfo {
  id: string;                 // e.g. "llama3.1:70b"
  name: string;               // display name
  provider: string;
  size?: number;              // parameter count in billions
  quantization?: string;      // e.g. "Q4_K_M"
  contextLength?: number;
  family?: string;            // "llama" | "mistral" | "qwen" | ...
  modifiedAt?: string;
  sizeOnDisk?: number;        // bytes
}

export interface ChatParams {
  model: string;
  messages: { role: string; content: string }[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface ChatResponse {
  content: string;
  promptTokens?: number;
  completionTokens?: number;
}

export interface StreamChunk {
  content: string;
  promptTokens?: number;
  completionTokens?: number;
  done?: boolean;
}

export interface LLMProvider {
  name: string;               // "Ollama" | "LM Studio" | "Jan" | "GPT4All" | "llama.cpp"
  baseUrl: string;
  isAvailable(): Promise<boolean>;
  listModels(): Promise<ModelInfo[]>;
  chat(params: ChatParams, signal?: AbortSignal): Promise<ChatResponse>;
  chatStream(params: ChatParams, signal?: AbortSignal): AsyncGenerator<StreamChunk, void, unknown>;
}

export async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeoutMs?: number }
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  const parentSignal = options.signal;
  if (parentSignal) {
    if (parentSignal.aborted) {
      controller.abort();
    } else {
      parentSignal.addEventListener('abort', () => controller.abort());
    }
  }

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}
