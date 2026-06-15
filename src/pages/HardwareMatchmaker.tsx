import { useState, useEffect } from 'react';
import { useProvidersStore } from '../store/providersStore';
import type { SystemInfo } from '../types';
import { 
  Cpu, Zap, CheckCircle2, AlertTriangle, XCircle, 
  ArrowUpRight, Laptop, ChevronDown, ChevronUp, RefreshCw, Layers,
  Download, Copy, Search, Trash2
} from 'lucide-react';

interface RecommendedModel {
  name: string;
  repoName: string;
  parameterSize: string;
  memoryRequiredGB: number;
  category: 'coding' | 'general' | 'creative' | 'speed';
  description: string;
  ollamaUrl: string;
  huggingFaceUrl: string;
}

const RECOMMENDED_MODELS: RecommendedModel[] = [
  {
    name: "Qwen 2.5 Coder 32B",
    repoName: "qwen2.5-coder:32b",
    parameterSize: "32B",
    memoryRequiredGB: 20.0,
    category: "coding",
    description: "Alibaba's flagship 32B code generation model. Offers coding capability close to GPT-4o with strong reasoning and system design.",
    ollamaUrl: "https://ollama.com/library/qwen2.5-coder:32b",
    huggingFaceUrl: "https://huggingface.co/Qwen/Qwen2.5-Coder-32B-Instruct"
  },
  {
    name: "Phi 4 14B Instruct",
    repoName: "phi4",
    parameterSize: "14B",
    memoryRequiredGB: 10.0,
    category: "general",
    description: "Microsoft's state-of-the-art 14B reasoning model. Built on highly curated data sources and advanced synthetic data generation.",
    ollamaUrl: "https://ollama.com/library/phi4",
    huggingFaceUrl: "https://huggingface.co/microsoft/phi-4"
  },
  {
    name: "Gemma 2 2B Instruct",
    repoName: "gemma2:2b",
    parameterSize: "2B",
    memoryRequiredGB: 1.6,
    category: "speed",
    description: "Google's ultra-lightweight Gemma 2 model. Highly efficient and fits on almost any device with excellent quality.",
    ollamaUrl: "https://ollama.com/library/gemma2:2b",
    huggingFaceUrl: "https://huggingface.co/google/gemma-2-2b-it"
  },
  {
    name: "Llama 3.3 70B Instruct",
    repoName: "llama3.3",
    parameterSize: "70B",
    memoryRequiredGB: 42.0,
    category: "general",
    description: "Meta's state-of-the-art Llama 3.3 model, featuring a 128k context length and industry-leading reasoning performance.",
    ollamaUrl: "https://ollama.com/library/llama3.3",
    huggingFaceUrl: "https://huggingface.co/meta-llama/Llama-3.3-70B-Instruct"
  },
  {
    name: "Qwen 2.5 Coder 7B",
    repoName: "qwen2.5-coder:7b",
    parameterSize: "7B",
    memoryRequiredGB: 5.5,
    category: "coding",
    description: "State-of-the-art coding and reasoning model from Alibaba. Excellent at code completion, bug fixes, and system design.",
    ollamaUrl: "https://ollama.com/library/qwen2.5-coder",
    huggingFaceUrl: "https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct"
  },
  {
    name: "DeepSeek Coder V2 Lite",
    repoName: "deepseek-coder-v2:16b",
    parameterSize: "16B",
    memoryRequiredGB: 11.5,
    category: "coding",
    description: "Mixture-of-Experts coding model showing parity with GPT-4 in mathematical and programming evaluations.",
    ollamaUrl: "https://ollama.com/library/deepseek-coder-v2",
    huggingFaceUrl: "https://huggingface.co/deepseek-ai/DeepSeek-Coder-V2-Lite-Instruct"
  },
  {
    name: "Llama 3.1 8B Instruct",
    repoName: "llama3.1:8b",
    parameterSize: "8B",
    memoryRequiredGB: 6.0,
    category: "general",
    description: "Meta's flagship lightweight model. Top-tier performance for general conversation, structured JSON extraction, and agent tasks.",
    ollamaUrl: "https://ollama.com/library/llama3.1",
    huggingFaceUrl: "https://huggingface.co/meta-llama/Llama-3.1-8B-Instruct"
  },
  {
    name: "Gemma 2 9B Instruct",
    repoName: "gemma2:9b",
    parameterSize: "9B",
    memoryRequiredGB: 7.2,
    category: "general",
    description: "Google's open weights model with a custom sliding window attention. Excellent reasoning, comprehension, and structured outputs.",
    ollamaUrl: "https://ollama.com/library/gemma2",
    huggingFaceUrl: "https://huggingface.co/google/gemma-2-9b-it"
  },
  {
    name: "Phi 3.5 Mini Instruct",
    repoName: "phi3.5:3.8b",
    parameterSize: "3.8B",
    memoryRequiredGB: 3.1,
    category: "speed",
    description: "Microsoft's highly optimized small language model. Excels at fast reasoning and multi-lingual instruction matching in small memory slots.",
    ollamaUrl: "https://ollama.com/library/phi3.5",
    huggingFaceUrl: "https://huggingface.co/microsoft/Phi-3.5-mini-instruct"
  },
  {
    name: "Qwen 2.5 Coder 1.5B",
    repoName: "qwen2.5-coder:1.5b",
    parameterSize: "1.5B",
    memoryRequiredGB: 1.8,
    category: "speed",
    description: "Sub-2B parameter model built specifically for code generation and lightweight terminal integration. Extremely fast on standard CPUs.",
    ollamaUrl: "https://ollama.com/library/qwen2.5-coder:1.5b",
    huggingFaceUrl: "https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct"
  },
  {
    name: "Mistral 7B Instruct v0.3",
    repoName: "mistral:7b",
    parameterSize: "7B",
    memoryRequiredGB: 5.1,
    category: "creative",
    description: "Legendary model for creative writing, storytelling, and open-ended text generations. Highly customisable.",
    ollamaUrl: "https://ollama.com/library/mistral",
    huggingFaceUrl: "https://huggingface.co/mistralai/Mistral-7B-Instruct-v0.3"
  },
  {
    name: "Gemma 2 27B Instruct",
    repoName: "gemma2:27b",
    parameterSize: "27B",
    memoryRequiredGB: 19.5,
    category: "general",
    description: "Near frontier-class reasoning and language understanding. Suitable for complex coding and multi-hop logical deductions.",
    ollamaUrl: "https://ollama.com/library/gemma2:27b",
    huggingFaceUrl: "https://huggingface.co/google/gemma-2-27b-it"
  },
  {
    name: "Llama 3.1 70B Instruct",
    repoName: "llama3.1:70b",
    parameterSize: "70B",
    memoryRequiredGB: 46.0,
    category: "general",
    description: "Frontier level open-source model. Requires high-end servers or professional workstations with substantial memory/VRAM.",
    ollamaUrl: "https://ollama.com/library/llama3.1:70b",
    huggingFaceUrl: "https://huggingface.co/meta-llama/Llama-3.1-70B-Instruct"
  },
  {
    name: "Hermes 3 Llama 3.1 8B",
    repoName: "hermes3:8b",
    parameterSize: "8B",
    memoryRequiredGB: 6.0,
    category: "creative",
    description: "Nous Research's flagship fine-tune. Superior creative capabilities, agent roleplay, complex instruction following, and uncensored responses.",
    ollamaUrl: "https://ollama.com/library/hermes3",
    huggingFaceUrl: "https://huggingface.co/NousResearch/Hermes-3-Llama-3.1-8B"
  },
  {
    name: "Llama 3.2 1B Instruct",
    repoName: "llama3.2:1b",
    parameterSize: "1B",
    memoryRequiredGB: 1.3,
    category: "speed",
    description: "Meta's ultra-compact model optimized for on-device translation, summarization, and lightweight text processing.",
    ollamaUrl: "https://ollama.com/library/llama3.2:1b",
    huggingFaceUrl: "https://huggingface.co/meta-llama/Llama-3.2-1B-Instruct"
  },
  {
    name: "Llama 3.2 3B Instruct",
    repoName: "llama3.2:3b",
    parameterSize: "3B",
    memoryRequiredGB: 2.5,
    category: "speed",
    description: "Meta's highly optimized lightweight model for writing assistance, content creation, and mobile execution.",
    ollamaUrl: "https://ollama.com/library/llama3.2",
    huggingFaceUrl: "https://huggingface.co/meta-llama/Llama-3.2-3B-Instruct"
  },
  {
    name: "Mistral Nemo 12B Instruct",
    repoName: "mistral-nemo:12b",
    parameterSize: "12B",
    memoryRequiredGB: 8.5,
    category: "general",
    description: "Advanced 12B model co-developed by Mistral AI and NVIDIA. Features a 128k context window and great multilingual capacities.",
    ollamaUrl: "https://ollama.com/library/mistral-nemo",
    huggingFaceUrl: "https://huggingface.co/mistralai/Mistral-Nemo-Instruct-2407"
  },
  {
    name: "Qwen 2.5 14B Instruct",
    repoName: "qwen2.5:14b",
    parameterSize: "14B",
    memoryRequiredGB: 10.0,
    category: "general",
    description: "Strong reasoning and language generation capabilities, striking a perfect balance between speed and advanced intelligence.",
    ollamaUrl: "https://ollama.com/library/qwen2.5:14b",
    huggingFaceUrl: "https://huggingface.co/Qwen/Qwen2.5-14B-Instruct"
  },
  {
    name: "Qwen 2.5 72B Instruct",
    repoName: "qwen2.5:72b",
    parameterSize: "72B",
    memoryRequiredGB: 48.0,
    category: "general",
    description: "Frontier open weights model with world-class performance in math, coding, translation, and structured reasoning.",
    ollamaUrl: "https://ollama.com/library/qwen2.5:72b",
    huggingFaceUrl: "https://huggingface.co/Qwen/Qwen2.5-72B-Instruct"
  },
  {
    name: "CodeLlama 13B Instruct",
    repoName: "codellama:13b",
    parameterSize: "13B",
    memoryRequiredGB: 9.5,
    category: "coding",
    description: "Meta's Llama 2 variant fine-tuned specifically for synthesis, explanation, and code generation across major languages.",
    ollamaUrl: "https://ollama.com/library/codellama:13b",
    huggingFaceUrl: "https://huggingface.co/codellama/CodeLlama-13b-Instruct-hf"
  },
  {
    name: "DeepSeek Coder 6.7B Instruct",
    repoName: "deepseek-coder:6.7b",
    parameterSize: "6.7B",
    memoryRequiredGB: 5.0,
    category: "coding",
    description: "Highly efficient software assistant trained on a vast corpus of source code. Very fast output speeds.",
    ollamaUrl: "https://ollama.com/library/deepseek-coder:6.7b",
    huggingFaceUrl: "https://huggingface.co/deepseek-ai/deepseek-coder-6.7b-instruct"
  },
  {
    name: "Phi 3.5 MoE Instruct",
    repoName: "phi3.5-moe:42b",
    parameterSize: "42B",
    memoryRequiredGB: 26.0,
    category: "general",
    description: "Microsoft's Mixture-of-Experts model. Uses active routing to achieve 70B-class intelligence with a smaller latency footprint.",
    ollamaUrl: "https://ollama.com/library/phi3.5-moe",
    huggingFaceUrl: "https://huggingface.co/microsoft/Phi-3.5-MoE-instruct"
  },
  {
    name: "Command R 35B",
    repoName: "command-r:35b",
    parameterSize: "35B",
    memoryRequiredGB: 24.0,
    category: "creative",
    description: "Cohere's enterprise-grade model optimized for long context, advanced retrieval-augmented generation (RAG), and text styling.",
    ollamaUrl: "https://ollama.com/library/command-r",
    huggingFaceUrl: "https://huggingface.co/CohereForAI/c4ai-command-r-v01"
  },
  {
    name: "Stable LM 2 1.6B",
    repoName: "stable-lm2:1.6b",
    parameterSize: "1.6B",
    memoryRequiredGB: 1.6,
    category: "speed",
    description: "Stability AI's ultra-small, multi-lingual model. Perfect for running on low-resource hardware like tablets or older laptops.",
    ollamaUrl: "https://ollama.com/library/stable-lm2",
    huggingFaceUrl: "https://huggingface.co/stabilityai/stablelm-2-zephyr-1_6b"
  },
  {
    name: "DeepSeek R1 Distill Qwen 1.5B",
    repoName: "deepseek-r1:1.5b",
    parameterSize: "1.5B",
    memoryRequiredGB: 1.8,
    category: "speed",
    description: "DeepSeek's 1.5B reasoning model distilled from Qwen. Ultra-fast step-by-step logic that fits on almost any device.",
    ollamaUrl: "https://ollama.com/library/deepseek-r1:1.5b",
    huggingFaceUrl: "https://huggingface.co/deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B"
  },
  {
    name: "DeepSeek R1 Distill Qwen 7B",
    repoName: "deepseek-r1:7b",
    parameterSize: "7B",
    memoryRequiredGB: 5.5,
    category: "general",
    description: "DeepSeek's 7B reasoning model distilled from Qwen. High-quality logical deduction, math, and coding in a mid-size footprint.",
    ollamaUrl: "https://ollama.com/library/deepseek-r1:7b",
    huggingFaceUrl: "https://huggingface.co/deepseek-ai/DeepSeek-R1-Distill-Qwen-7B"
  },
  {
    name: "DeepSeek R1 Distill Llama 8B",
    repoName: "deepseek-r1:8b",
    parameterSize: "8B",
    memoryRequiredGB: 6.0,
    category: "general",
    description: "DeepSeek's 8B reasoning model distilled from Llama 3.1. Excellent multi-turn reasoning and general capabilities.",
    ollamaUrl: "https://ollama.com/library/deepseek-r1:8b",
    huggingFaceUrl: "https://huggingface.co/deepseek-ai/DeepSeek-R1-Distill-Llama-8B"
  },
  {
    name: "DeepSeek R1 Distill Qwen 14B",
    repoName: "deepseek-r1:14b",
    parameterSize: "14B",
    memoryRequiredGB: 10.0,
    category: "general",
    description: "DeepSeek's 14B reasoning model distilled from Qwen. Outstanding balance of deep mathematical reasoning and execution speed.",
    ollamaUrl: "https://ollama.com/library/deepseek-r1:14b",
    huggingFaceUrl: "https://huggingface.co/deepseek-ai/DeepSeek-R1-Distill-Qwen-14B"
  },
  {
    name: "DeepSeek R1 Distill Qwen 32B",
    repoName: "deepseek-r1:32b",
    parameterSize: "32B",
    memoryRequiredGB: 20.0,
    category: "general",
    description: "DeepSeek's 32B reasoning model distilled from Qwen. Frontier-class logic, coding, and problem-solving.",
    ollamaUrl: "https://ollama.com/library/deepseek-r1:32b",
    huggingFaceUrl: "https://huggingface.co/deepseek-ai/DeepSeek-R1-Distill-Qwen-32B"
  },
  {
    name: "DeepSeek R1 Distill Llama 70B",
    repoName: "deepseek-r1:70b",
    parameterSize: "70B",
    memoryRequiredGB: 42.0,
    category: "general",
    description: "DeepSeek's flagship 70B reasoning model distilled from Llama 3.3. Outstanding multi-turn reasoning and math performance.",
    ollamaUrl: "https://ollama.com/library/deepseek-r1:70b",
    huggingFaceUrl: "https://huggingface.co/deepseek-ai/DeepSeek-R1-Distill-Llama-70B"
  },
  {
    name: "DeepSeek R1 671B MoE",
    repoName: "deepseek-r1:671b",
    parameterSize: "671B",
    memoryRequiredGB: 400.0,
    category: "general",
    description: "The flagship DeepSeek R1 reasoning model. World-class reasoning on par with proprietary models.",
    ollamaUrl: "https://ollama.com/library/deepseek-r1:671b",
    huggingFaceUrl: "https://huggingface.co/deepseek-ai/DeepSeek-R1"
  },
  {
    name: "Qwen 2.5 0.5B Instruct",
    repoName: "qwen2.5:0.5b",
    parameterSize: "0.5B",
    memoryRequiredGB: 0.8,
    category: "speed",
    description: "Alibaba's ultra-compact 0.5B model. Designed for edge computing and extremely fast execution on low-end hardware.",
    ollamaUrl: "https://ollama.com/library/qwen2.5:0.5b",
    huggingFaceUrl: "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct"
  },
  {
    name: "Qwen 2.5 1.5B Instruct",
    repoName: "qwen2.5:1.5b",
    parameterSize: "1.5B",
    memoryRequiredGB: 1.8,
    category: "speed",
    description: "Alibaba's 1.5B model offering strong language generation and translation speed in a tiny memory footprint.",
    ollamaUrl: "https://ollama.com/library/qwen2.5:1.5b",
    huggingFaceUrl: "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct"
  },
  {
    name: "Qwen 2.5 3B Instruct",
    repoName: "qwen2.5:3b",
    parameterSize: "3B",
    memoryRequiredGB: 2.5,
    category: "speed",
    description: "Alibaba's 3B model, striking an excellent balance of comprehension quality and hardware requirements.",
    ollamaUrl: "https://ollama.com/library/qwen2.5:3b",
    huggingFaceUrl: "https://huggingface.co/Qwen/Qwen2.5-3B-Instruct"
  },
  {
    name: "Qwen 2.5 7B Instruct",
    repoName: "qwen2.5:7b",
    parameterSize: "7B",
    memoryRequiredGB: 5.5,
    category: "general",
    description: "Alibaba's flagship 7B general model. Outstanding multilingual reasoning and code comprehension.",
    ollamaUrl: "https://ollama.com/library/qwen2.5:7b",
    huggingFaceUrl: "https://huggingface.co/Qwen/Qwen2.5-7B-Instruct"
  },
  {
    name: "Qwen 2.5 32B Instruct",
    repoName: "qwen2.5:32b",
    parameterSize: "32B",
    memoryRequiredGB: 20.0,
    category: "general",
    description: "Powerful 32B general model from Alibaba. Superior coding, reasoning, and system capabilities.",
    ollamaUrl: "https://ollama.com/library/qwen2.5:32b",
    huggingFaceUrl: "https://huggingface.co/Qwen/Qwen2.5-32B-Instruct"
  },
  {
    name: "Llama 3.2 Vision 11B",
    repoName: "llama3.2-vision:11b",
    parameterSize: "11B",
    memoryRequiredGB: 8.5,
    category: "general",
    description: "Meta's first open multimodal model. Excels at image understanding, visual QA, and structured text tasks.",
    ollamaUrl: "https://ollama.com/library/llama3.2-vision",
    huggingFaceUrl: "https://huggingface.co/meta-llama/Llama-3.2-11B-Vision-Instruct"
  },
  {
    name: "Llava 7B",
    repoName: "llava:7b",
    parameterSize: "7B",
    memoryRequiredGB: 5.0,
    category: "general",
    description: "Popular open-source multimodal model. Integrates a CLIP vision encoder with a text LLM for rich image comprehension.",
    ollamaUrl: "https://ollama.com/library/llava",
    huggingFaceUrl: "https://huggingface.co/liuhaotian/llava-v1.5-7b"
  },
  {
    name: "SmolLM 135M Instruct",
    repoName: "smollm:135m",
    parameterSize: "135M",
    memoryRequiredGB: 0.3,
    category: "speed",
    description: "Hugging Face's ultra-mini model designed for local, lightweight web browser execution and tiny slots.",
    ollamaUrl: "https://ollama.com/library/smollm:135m",
    huggingFaceUrl: "https://huggingface.co/HuggingFaceTB/SmolLM-135M-Instruct"
  },
  {
    name: "SmolLM 1.7B Instruct",
    repoName: "smollm:1.7b",
    parameterSize: "1.7B",
    memoryRequiredGB: 1.8,
    category: "speed",
    description: "Hugging Face's high-efficiency 1.7B model. Trained on high-quality synthetic data for fast local tasks.",
    ollamaUrl: "https://ollama.com/library/smollm:1.7b",
    huggingFaceUrl: "https://huggingface.co/HuggingFaceTB/SmolLM-1.7B-Instruct"
  },
  {
    name: "TinyLlama 1.1B Instruct",
    repoName: "tinyllama",
    parameterSize: "1.1B",
    memoryRequiredGB: 1.1,
    category: "speed",
    description: "A compact 1.1B model trained on 3 trillion tokens. Delivers fast text generation on low-end hardware.",
    ollamaUrl: "https://ollama.com/library/tinyllama",
    huggingFaceUrl: "https://huggingface.co/TinyLlama/TinyLlama-1.1B-Chat-v1.0"
  },
  {
    name: "Nomic Embed Text v1.5",
    repoName: "nomic-embed-text",
    parameterSize: "137M",
    memoryRequiredGB: 0.6,
    category: "speed",
    description: "Highly popular embedding model with a long 8192 context window. Crucial for local semantic searches and RAG.",
    ollamaUrl: "https://ollama.com/library/nomic-embed-text",
    huggingFaceUrl: "https://huggingface.co/nomic-ai/nomic-embed-text-v1.5"
  }
];

const formatBytes = (bytes?: number) => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const estimateParameterSizeAndMemory = (modelId: string, sizeOnDiskBytes?: number) => {
  const paramMatch = modelId.match(/(\d+(?:\.\d+)?)[bB]/);
  let parameterSize = paramMatch ? `${paramMatch[1].toUpperCase()}B` : '';
  
  let memoryRequiredGB = 0;
  if (sizeOnDiskBytes) {
    const sizeGB = sizeOnDiskBytes / (1024 * 1024 * 1024);
    let overhead = 1.5;
    if (sizeGB < 2) overhead = 0.5;
    else if (sizeGB < 8) overhead = 1.2;
    else if (sizeGB < 25) overhead = 2.5;
    else overhead = 4.0;
    memoryRequiredGB = Math.round((sizeGB + overhead) * 10) / 10;
    
    if (!parameterSize) {
      const estParams = Math.round(sizeGB / 0.6);
      parameterSize = `${estParams}B`;
    }
  } else {
    if (paramMatch) {
      const params = parseFloat(paramMatch[1]);
      memoryRequiredGB = Math.round((params * 0.65 + 1.5) * 10) / 10;
    } else {
      memoryRequiredGB = 6.0;
      parameterSize = '8B';
    }
  }

  return { parameterSize, memoryRequiredGB };
};

const determineCategory = (modelId: string, memoryRequiredGB: number): 'coding' | 'general' | 'creative' | 'speed' => {
  const lowerId = modelId.toLowerCase();
  if (lowerId.includes('coder') || lowerId.includes('code') || lowerId.includes('developer')) {
    return 'coding';
  }
  if (lowerId.includes('writer') || lowerId.includes('creative') || lowerId.includes('story') || lowerId.includes('hermes') || lowerId.includes('command') || lowerId.includes('mistral')) {
    return 'creative';
  }
  if (memoryRequiredGB <= 3.5 || lowerId.includes('mini') || lowerId.includes('speed') || lowerId.includes('tiny') || lowerId.includes('small') || lowerId.includes('lightweight')) {
    return 'speed';
  }
  return 'general';
};

export interface PullProgress {
  status: string;
  percentage: number;
  completed?: number;
  total?: number;
  isDownloading: boolean;
  error?: string | null;
}

interface ModelCardProps {
  model: RecommendedModel & { tier: 'butter' | 'struggle' | 'unrecommended'; reason: string };
  openLink: (url: string) => void;
  progress?: PullProgress;
  onInstall: (model: RecommendedModel) => void;
  onCancel: (model: RecommendedModel) => void;
  onDelete: (model: RecommendedModel) => Promise<void>;
}

function ModelCard({ model, openLink, progress, onInstall, onCancel, onDelete }: ModelCardProps) {
  const { models, providers } = useProvidersStore();
  const [copied, setCopied] = useState(false);

  // Find local Ollama provider configuration
  const ollamaProvider = providers.find(p => p.name === "Ollama");
  const isOllamaConnected = ollamaProvider?.isConnected ?? false;

  // Check if model is already downloaded locally in Ollama cache
  const isInstalled = models.some(
    m => typeof m.provider === 'string' && m.provider.toLowerCase() === 'ollama' && 
         typeof m.id === 'string' && m.id.toLowerCase().replace(/:latest$/, '') === model.repoName.toLowerCase()
  );

  const handleCopy = () => {
    navigator.clipboard.writeText(`ollama run ${model.repoName}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const formatGB = (bytes?: number) => {
    if (!bytes) return '0.0 GB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  };

  const badgeColorClass = model.tier === 'butter' 
    ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' 
    : model.tier === 'struggle' 
      ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' 
      : 'bg-red-500/10 text-red-500 border-red-500/20';

  return (
    <div className={`p-5 rounded-2xl bg-card border border-border/80 shadow-sm flex flex-col justify-between transition-all duration-200 group ${
      model.tier === 'butter' ? 'hover:border-emerald-500/35 hover:shadow-md' :
      model.tier === 'struggle' ? 'hover:border-amber-500/35 hover:shadow-md' :
      'opacity-75 hover:opacity-100'
    }`}>
      <div className="space-y-3">
        {/* Card Header */}
        <div className="flex justify-between items-start">
          <div>
            <h4 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{model.name}</h4>
            <span className="text-[10px] font-mono text-muted-foreground font-semibold block mt-0.5">{model.repoName}</span>
          </div>
          <span className={`px-2 py-0.5 rounded border text-[9px] font-extrabold uppercase tracking-wide shrink-0 ${badgeColorClass}`}>
            {model.parameterSize}
          </span>
        </div>

        {/* Model description */}
        <p className="text-xs text-muted-foreground leading-relaxed">
          {model.description}
        </p>

        {/* Command Copy Helper */}
        <div className="flex items-center justify-between gap-3 bg-secondary/35 px-3 py-2 rounded-xl border border-border/40 text-[10px] font-mono select-text">
          <span className="text-muted-foreground truncate">ollama run {model.repoName}</span>
          <button 
            onClick={handleCopy}
            className="text-primary hover:text-primary/80 font-bold shrink-0 flex items-center gap-1 cursor-pointer select-none"
            title="Copy command to clipboard"
          >
            {copied ? (
              <span className="text-emerald-500">Copied!</span>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>

        {/* Suitability Banner */}
        <div className={`text-[10px] font-semibold leading-normal p-2.5 rounded-xl border ${
          model.tier === 'butter' ? 'bg-emerald-500/5 text-emerald-500/90 border-emerald-500/10' :
          model.tier === 'struggle' ? 'bg-amber-500/5 text-amber-500/90 border-amber-500/10' :
          'bg-red-500/5 text-red-500/90 border-red-500/10'
        }`}>
          <strong>{model.tier === 'unrecommended' ? 'Overload Reason' : 'Suitability'}:</strong> {model.reason}
        </div>

        {/* Installation Error Banner */}
        {progress && progress.error && progress.error !== "Cancelled" && (
          <div className="text-[10px] text-red-500 font-bold bg-red-500/5 p-2 rounded-lg border border-red-500/10 mt-1 flex items-center gap-1.5 animate-pulse">
            <XCircle className="h-3.5 w-3.5 shrink-0" />
            <span>Installation failed: {progress.error}</span>
          </div>
        )}
      </div>

      {/* Button Actions or Download Progress Visuals */}
      <div className="mt-5 border-t border-border/40 pt-4">
        {progress && progress.isDownloading ? (
          <div className="space-y-2 select-none">
            {/* Status info */}
            <div className="flex justify-between items-center text-[10px] font-bold text-muted-foreground">
              <span className="capitalize text-primary truncate max-w-[150px]">{progress.status}</span>
              <span className="text-foreground">{progress.percentage}%</span>
            </div>

            {/* Progress Bar */}
            <div className="h-2 w-full bg-secondary rounded-full overflow-hidden border border-border/60">
              <div 
                className="h-full bg-primary transition-all duration-300 rounded-full" 
                style={{ width: `${progress.percentage}%` }}
              />
            </div>

            {/* Download Speeds/Sizes & Cancel Trigger */}
            <div className="flex justify-between items-center text-[10px] text-muted-foreground mt-1">
              <span>
                {progress.completed && progress.total
                  ? `${formatGB(progress.completed)} / ${formatGB(progress.total)}`
                  : "Connecting..."}
              </span>
              <button 
                onClick={() => onCancel(model)}
                className="btn-destructive text-[9px] font-bold h-6 px-2.5 rounded-md flex items-center gap-1 select-none"
              >
                Stop
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2.5">
            {isInstalled ? (
              <div className="flex-1 flex gap-1.5">
                <button 
                  disabled
                  className="flex-1 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 h-8 px-2 flex items-center justify-center gap-1.5 text-[10px] font-bold rounded-lg cursor-default"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Installed
                </button>
                {isOllamaConnected && (
                  <button
                    onClick={() => onDelete(model)}
                    className="bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 hover:border-red-500/30 h-8 w-8 flex items-center justify-center rounded-lg transition-all cursor-pointer"
                    title="Uninstall/Remove model from device"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ) : (
              <button 
                onClick={() => onInstall(model)}
                className="flex-1 btn-primary h-8 px-2 flex items-center justify-center gap-1.5 text-[10px] font-bold"
                title={isOllamaConnected ? "Pull directly to local Ollama" : "Ollama Offline: Opens download website"}
              >
                <Download className="h-3.5 w-3.5" />
                {isOllamaConnected ? "Install Model" : "Install via Web"}
              </button>
            )}
            <button 
              onClick={() => openLink(model.huggingFaceUrl)}
              className="flex-1 btn-secondary h-8 px-2 flex items-center justify-center gap-1 text-[10px] font-bold"
            >
              Hugging Face
              <ArrowUpRight className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function HardwareMatchmaker() {
  const { systemInfo, loadSystemInfo, providers, refreshModels, loadProviders, models } = useProvidersStore();
  const [activeCategory, setActiveCategory] = useState<'all' | 'coding' | 'general' | 'creative' | 'speed'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showUnrecommended, setShowUnrecommended] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [sortBy, setSortBy] = useState<'suitability' | 'memory-asc' | 'memory-desc' | 'name-asc' | 'installed'>('suitability');
  
  // Track download progress for all pulling models
  const [pullProgresses, setPullProgresses] = useState<Record<string, PullProgress>>({});

  useEffect(() => {
    if (!systemInfo) {
      loadSystemInfo();
    }
  }, [systemInfo]);

  // Subscribe to Ollama pull progress events
  useEffect(() => {
    const unsubscribe = window.electronAPI.onModelPullProgress((data) => {
      const { modelName, status, percentage, completed, total, done, error } = data;
      
      setPullProgresses(prev => {
        const next = { ...prev };
        
        if (error) {
          next[modelName] = {
            status: error === "CANCELLED" ? "Cancelled" : `Failed: ${error}`,
            percentage: 0,
            isDownloading: false,
            error: error === "CANCELLED" ? "Cancelled" : error
          };
        } else if (done) {
          next[modelName] = {
            status: "Installed",
            percentage: 100,
            isDownloading: false,
            error: null
          };
          useProvidersStore.getState().loadProviders();
        } else {
          next[modelName] = {
            status: status || "Downloading",
            percentage: percentage ?? 0,
            completed,
            total,
            isDownloading: true,
            error: null
          };
        }
        return next;
      });
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleRescan = async () => {
    setIsScanning(true);
    await loadSystemInfo();
    // Artificial small delay for premium feels
    setTimeout(() => {
      setIsScanning(false);
    }, 800);
  };

  const openLink = (url: string) => {
    window.electronAPI.openExternal(url);
  };

  const handleInstallModel = async (model: RecommendedModel) => {
    const ollamaProvider = providers.find(p => p.name === "Ollama");
    const ollamaUrl = ollamaProvider?.url || "http://localhost:11434";
    
    // Set initial loading state in frontend
    setPullProgresses(prev => ({
      ...prev,
      [model.repoName]: {
        status: "Starting download...",
        percentage: 0,
        isDownloading: true,
        error: null
      }
    }));

    try {
      const success = await window.electronAPI.startPullModel(ollamaUrl, model.repoName);
      if (success) {
        // Refresh local models database
        await refreshModels();
      }
    } catch (err: any) {
      setPullProgresses(prev => ({
        ...prev,
        [model.repoName]: {
          status: "Error starting download",
          percentage: 0,
          isDownloading: false,
          error: err.message ?? "Error"
        }
      }));
    }
  };

  const handleCancelInstall = async (model: RecommendedModel) => {
    try {
      await window.electronAPI.cancelPullModel(model.repoName);
      setPullProgresses(prev => ({
        ...prev,
        [model.repoName]: {
          status: "Cancelled",
          percentage: prev[model.repoName]?.percentage ?? 0,
          isDownloading: false,
          error: "Cancelled"
        }
      }));
    } catch (e) {
      console.error("Failed to cancel pull:", e);
    }
  };

  const handleDeleteModel = async (model: RecommendedModel) => {
    if (!window.confirm(`Are you sure you want to remove ${model.name} (${model.repoName}) from your device?`)) {
      return;
    }
    
    setPullProgresses(prev => ({
      ...prev,
      [model.repoName]: {
        status: "Deleting...",
        percentage: 0,
        isDownloading: true,
        error: null
      }
    }));

    try {
      const success = await window.electronAPI.deleteModel(model.repoName);
      if (success) {
        setPullProgresses(prev => {
          const next = { ...prev };
          delete next[model.repoName];
          return next;
        });
        await refreshModels();
        await loadProviders();
      } else {
        setPullProgresses(prev => ({
          ...prev,
          [model.repoName]: {
            status: "Failed to delete",
            percentage: 0,
            isDownloading: false,
            error: "Failed to run ollama rm"
          }
        }));
      }
    } catch (err: any) {
      setPullProgresses(prev => ({
        ...prev,
        [model.repoName]: {
          status: "Error deleting",
          percentage: 0,
          isDownloading: false,
          error: err.message ?? "Error"
        }
      }));
    }
  };

  const evaluateModelSuitability = (model: RecommendedModel, system: SystemInfo) => {
    const totalRam = system.ramTotalGB || 8; // Default fallback to 8GB
    const gpuVramMB = system.gpuVramMB || 0;

    // 1. Apple Silicon (Unified Memory)
    if (system.isAppleSilicon) {
      const safeGpuLimit = totalRam * 0.70; // typically up to 70% can be allocated to VRAM comfortably
      const struggleLimit = totalRam * 0.90;

      if (model.memoryRequiredGB <= safeGpuLimit) {
        const isRamAvailableLow = model.memoryRequiredGB > system.ramAvailableGB;
        return {
          tier: 'butter' as const,
          reason: `Fits comfortably in unified memory (uses ~${model.memoryRequiredGB} GB, safe limit: ${safeGpuLimit.toFixed(1)} GB).` +
            (isRamAvailableLow ? ` Note: Current free RAM (${system.ramAvailableGB} GB) is low; close other apps before running.` : "")
        };
      } else if (model.memoryRequiredGB <= struggleLimit) {
        return {
          tier: 'struggle' as const,
          reason: `Exceeds optimal unified limit but fits inside system RAM. Performance may be degraded by swap activity.`
        };
      } else {
        return {
          tier: 'unrecommended' as const,
          reason: `Requires ~${model.memoryRequiredGB} GB, which exceeds your total System RAM (${totalRam} GB).`
        };
      }
    }

    // 2. Windows / Intel Mac with Dedicated GPU VRAM
    if (gpuVramMB > 0) {
      const vramGB = gpuVramMB / 1024;

      // Smooth as butter if it fits entirely in VRAM with headroom
      if (model.memoryRequiredGB <= vramGB * 0.85) {
        return {
          tier: 'butter' as const,
          reason: `Fits completely in Dedicated VRAM (needs ~${model.memoryRequiredGB} GB, available: ${vramGB.toFixed(1)} GB VRAM).`
        };
      }
      // Struggles but works if it fits in system RAM (offloading layers to CPU)
      else if (model.memoryRequiredGB <= totalRam * 0.80) {
        const isRamAvailableLow = model.memoryRequiredGB > system.ramAvailableGB;
        return {
          tier: 'struggle' as const,
          reason: `Exceeds VRAM (${vramGB.toFixed(1)} GB). Can run by offloading layers to CPU/RAM, but at slower speeds.` +
            (isRamAvailableLow ? ` Note: Current free RAM (${system.ramAvailableGB} GB) is low; close other apps to avoid swap latency.` : "")
        };
      }
      // Unrecommended
      else {
        return {
          tier: 'unrecommended' as const,
          reason: `Exceeds both GPU VRAM (${vramGB.toFixed(1)} GB) and safe system RAM footprint (${totalRam} GB).`
        };
      }
    }

    // 3. CPU-Only (Fallback or no GPU VRAM detected)
    if (model.memoryRequiredGB <= totalRam * 0.50) {
      const isRamAvailableLow = model.memoryRequiredGB > system.ramAvailableGB;
      return {
        tier: 'butter' as const,
        reason: `Runs on CPU. Fits comfortably within 50% of total system RAM (${totalRam} GB).` +
          (isRamAvailableLow ? ` Note: Current free RAM (${system.ramAvailableGB} GB) is low; close other apps before running.` : "")
      };
    } else if (model.memoryRequiredGB <= totalRam * 0.80) {
      const isRamAvailableLow = model.memoryRequiredGB > system.ramAvailableGB;
      return {
        tier: 'struggle' as const,
        reason: `Runs on CPU. Fits in RAM but will bottleneck resources. Sluggish generation speed expected.` +
          (isRamAvailableLow ? ` Note: Current free RAM (${system.ramAvailableGB} GB) is low; close other apps to avoid swap latency.` : "")
      };
    } else {
      return {
        tier: 'unrecommended' as const,
        reason: `Requires ~${model.memoryRequiredGB} GB, which exceeds available RAM headroom for CPU execution.`
      };
    }
  };

  if (!systemInfo) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground select-none">
        <Cpu className="h-10 w-10 animate-pulse mb-3 text-primary" />
        <span className="text-sm font-semibold">Scanning system hardware specifications...</span>
      </div>
    );
  }

  // Merge RECOMMENDED_MODELS with any other locally installed models
  const dynamicLocalModels: RecommendedModel[] = [];

  models.forEach(localModel => {
    // Only process local models
    const isLocalProvider = ['ollama', 'lm studio', 'jan', 'gpt4all', 'llama.cpp'].includes(localModel.provider.toLowerCase());
    if (!isLocalProvider) return;

    const localIdNormalized = localModel.id.toLowerCase().trim();
    const localNameNormalized = localModel.name.toLowerCase().trim();
    
    // Check if it already exists in RECOMMENDED_MODELS
    const exists = RECOMMENDED_MODELS.some(m => {
      const recRepo = m.repoName.toLowerCase().trim();
      const recBase = recRepo.split(':')[0];
      const recTag = recRepo.split(':')[1] || '';

      const localRepo = localModel.id.toLowerCase().trim();
      const localBase = localRepo.split(':')[0];
      const localTag = localRepo.split(':')[1] || '';

      if (recBase === localBase) {
        if (recTag === localTag || 
            recTag === 'latest' || localTag === 'latest' || 
            !recTag || !localTag) {
          return true;
        }
      }
      return false;
    });
    
    if (!exists) {
      const isOllama = localModel.provider.toLowerCase() === 'ollama';
      const cleanRepoName = localModel.id;
      const baseName = localModel.name || localModel.id.split(':')[0];
      
      const displayName = baseName
        .split(/[-_]/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ') + (localModel.id.includes(':') && !localModel.id.includes(':latest') ? ` ${localModel.id.split(':')[1].toUpperCase()}` : '');

      const { parameterSize, memoryRequiredGB } = estimateParameterSizeAndMemory(localModel.id, localModel.sizeOnDisk || localModel.size);
      const category = determineCategory(localModel.id, memoryRequiredGB);
      const description = `Locally installed model loaded from ${localModel.provider}. ` + 
        (localModel.sizeOnDisk ? `Uses ${formatBytes(localModel.sizeOnDisk)} on disk.` : '');

      dynamicLocalModels.push({
        name: displayName,
        repoName: cleanRepoName,
        parameterSize: parameterSize || 'Unknown',
        memoryRequiredGB,
        category,
        description,
        ollamaUrl: isOllama ? `https://ollama.com/library/${localModel.id.split(':')[0]}` : '',
        huggingFaceUrl: `https://huggingface.co/models?search=${encodeURIComponent(localModel.id.split(':')[0])}`
      });
    }
  });

  const allMergedModels = [...RECOMMENDED_MODELS, ...dynamicLocalModels];

  // Evaluate suitability for all merged models
  const evaluatedModels = allMergedModels.map(m => {
    const evaluation = evaluateModelSuitability(m, systemInfo);
    return {
      ...m,
      tier: evaluation.tier,
      reason: evaluation.reason
    };
  });

  // Filter models by category and search term
  const filteredModels = evaluatedModels
    .filter(m => {
      if (activeCategory === 'all') return true;
      return m.category === activeCategory;
    })
    .filter(m => {
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      return (
        m.name.toLowerCase().includes(term) ||
        m.repoName.toLowerCase().includes(term) ||
        m.description.toLowerCase().includes(term)
      );
    });

  // Sort based on chosen criteria
  const sortedModels = [...filteredModels].sort((a, b) => {
    if (sortBy === 'suitability') {
      const tierWeight = { butter: 1, struggle: 2, unrecommended: 3 };
      const diff = tierWeight[a.tier] - tierWeight[b.tier];
      if (diff !== 0) return diff;
      return a.memoryRequiredGB - b.memoryRequiredGB;
    }
    
    if (sortBy === 'memory-asc') {
      return a.memoryRequiredGB - b.memoryRequiredGB;
    }
    
    if (sortBy === 'memory-desc') {
      return b.memoryRequiredGB - a.memoryRequiredGB;
    }
    
    if (sortBy === 'name-asc') {
      return a.name.localeCompare(b.name);
    }
    
    if (sortBy === 'installed') {
      const aInstalled = models.some(
        m => typeof m.id === 'string' && 
             (m.id.toLowerCase().trim() === a.repoName.toLowerCase().trim() ||
              m.id.toLowerCase().replace(/:latest$/, '') === a.repoName.toLowerCase().replace(/:latest$/, ''))
      );
      const bInstalled = models.some(
        m => typeof m.id === 'string' && 
             (m.id.toLowerCase().trim() === b.repoName.toLowerCase().trim() ||
              m.id.toLowerCase().replace(/:latest$/, '') === b.repoName.toLowerCase().replace(/:latest$/, ''))
      );
      if (aInstalled && !bInstalled) return -1;
      if (!aInstalled && bInstalled) return 1;
      return a.memoryRequiredGB - b.memoryRequiredGB;
    }
    
    return 0;
  });

  // Split into tiers (only relevant when sortBy is 'suitability')
  const butterModels = sortedModels.filter(m => m.tier === 'butter');
  const struggleModels = sortedModels.filter(m => m.tier === 'struggle');
  const unrecommendedModels = sortedModels.filter(m => m.tier === 'unrecommended');

  const gpuNameDisplay = systemInfo.gpuBrand === "Integrated Graphics" || systemInfo.gpuBrand === "System Graphics"
    ? systemInfo.isAppleSilicon ? "Apple Unified Graphics" : "Integrated CPU Graphics"
    : systemInfo.gpuBrand;

  const gpuVramDisplay = systemInfo.gpuVramMB && systemInfo.gpuVramMB > 0
    ? `${(systemInfo.gpuVramMB / 1024).toFixed(1)} GB`
    : systemInfo.isAppleSilicon ? "Shared Unified" : "N/A";

  return (
    <div className="space-y-6 relative select-none">
      {/* Title */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Hardware Matchmaker</h2>
          <p className="text-sm text-muted-foreground">Scans system hardware specs and targets optimal local LLMs for your machine.</p>
        </div>
        <button
          onClick={handleRescan}
          disabled={isScanning}
          className="btn-secondary text-xs h-9 px-3.5 font-bold flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${isScanning ? 'animate-spin' : ''}`} />
          {isScanning ? 'Scanning...' : 'Rescan Hardware'}
        </button>
      </div>

      {/* Specs Banner */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-5 rounded-2xl bg-card border border-border shadow-sm relative overflow-hidden">
        {/* Glow effect background */}
        <div className="absolute right-0 top-0 h-40 w-40 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

        {/* OS Platform Card */}
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-primary/10 text-primary">
            <Laptop className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">OS Platform</span>
            <h4 className="text-sm font-bold text-foreground capitalize">
              {systemInfo.platform === 'darwin' ? 'macOS' : systemInfo.platform === 'win32' ? 'Windows' : systemInfo.platform}
              <span className="text-xs font-semibold text-muted-foreground ml-1">({systemInfo.arch})</span>
            </h4>
          </div>
        </div>

        {/* CPU Card */}
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-primary/10 text-primary">
            <Cpu className="h-5 w-5" />
          </div>
          <div className="truncate pr-1">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Processor</span>
            <h4 className="text-sm font-bold text-foreground truncate" title={systemInfo.cpuBrand}>
              {systemInfo.cpuBrand}
            </h4>
          </div>
        </div>

        {/* RAM Card */}
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-primary/10 text-primary">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">System Memory</span>
            <h4 className="text-sm font-bold text-foreground flex items-center flex-wrap gap-1">
              <span>{systemInfo.ramTotalGB} GB RAM</span>
              <span className="text-xs font-medium text-muted-foreground">({systemInfo.ramAvailableGB} GB free)</span>
              {systemInfo.isAppleSilicon && (
                <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-primary/15 text-primary uppercase leading-none">
                  Unified
                </span>
              )}
            </h4>
          </div>
        </div>

        {/* GPU Card */}
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-primary/10 text-primary">
            <Zap className="h-5 w-5" />
          </div>
          <div className="truncate pr-1">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Graphics & VRAM</span>
            <h4 className="text-sm font-bold text-foreground truncate" title={`${gpuNameDisplay} (${gpuVramDisplay})`}>
              {gpuVramDisplay !== 'N/A' ? `${gpuVramDisplay} VRAM` : 'No VRAM'}
              <span className="text-xs font-semibold text-muted-foreground ml-1.5 truncate">
                {gpuNameDisplay.split(' ').pop()}
              </span>
            </h4>
          </div>
        </div>
      </div>

      {/* Category Tabs Strip */}
      <div className="border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex gap-6 text-sm font-medium overflow-x-auto select-none no-scrollbar">
          {[
            { id: 'all', label: 'All Models', icon: '⊞' },
            { id: 'coding', label: 'Coding', icon: '⟨/⟩' },
            { id: 'general', label: 'Reasoning', icon: '⊡' },
            { id: 'creative', label: 'Creative', icon: '✦' },
            { id: 'speed', label: 'Lightweight', icon: '⚡' },
          ].map(tab => {
            const isActive = activeCategory === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveCategory(tab.id as any)}
                className={`pb-3 font-semibold relative text-xs whitespace-nowrap transition-colors duration-150 flex items-center gap-1.5 ${
                  isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className="text-[10px] opacity-70">{tab.icon}</span>
                {tab.label}
                {isActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
                )}
              </button>
            );
          })}
        </div>
        
        {/* Search input and button */}
        <div className="flex items-center gap-2 pb-3 flex-wrap">
          <div className="relative">
            <select 
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="form-input text-xs h-9 bg-card border border-border/60 rounded-xl px-2.5 cursor-pointer font-semibold"
            >
              <option value="suitability">Sort: Suitability & Size</option>
              <option value="memory-asc">Sort: Memory (Low to High)</option>
              <option value="memory-desc">Sort: Memory (High to Low)</option>
              <option value="name-asc">Sort: Name (A-Z)</option>
              <option value="installed">Sort: Installed Status</option>
            </select>
          </div>
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input 
              type="text" 
              placeholder="Search models..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="form-input text-xs pl-10 h-9 w-48"
            />
          </div>
          <button 
            type="button"
            className="btn-primary h-9 text-xs px-3"
            onClick={() => {
              // Input state binding filters dynamically, visual confirmation triggers click handler
            }}
          >
            Search
          </button>
          <span className="text-xs text-muted-foreground font-semibold select-none whitespace-nowrap ml-1">
            {sortedModels.length} matched
          </span>
        </div>
      </div>

      {/* Grid of Results */}
      <div className="space-y-8">
        {sortBy !== 'suitability' ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-primary">
              <Layers className="h-5 w-5 animate-pulse" />
              <h3 className="text-base font-bold">
                {sortBy === 'memory-asc' && "All Models: Smallest to Largest"}
                {sortBy === 'memory-desc' && "All Models: Largest to Smallest"}
                {sortBy === 'name-asc' && "All Models: Alphabetical A-Z"}
                {sortBy === 'installed' && "All Models: Installed Status First"}
              </h3>
            </div>

            {sortedModels.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in">
                {sortedModels.map(m => (
                  <ModelCard 
                    key={m.name} 
                    model={m} 
                    openLink={openLink} 
                    progress={pullProgresses[m.repoName]}
                    onInstall={handleInstallModel}
                    onCancel={handleCancelInstall}
                    onDelete={handleDeleteModel}
                  />
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-muted-foreground border border-dashed border-border rounded-2xl bg-card">
                No models match this category or search term.
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Tier 1: Recommended */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-emerald-500">
                <CheckCircle2 className="h-5 w-5" />
                <h3 className="text-base font-bold">Recommended</h3>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/10 uppercase font-semibold">Runs local at max speed</span>
              </div>

              {butterModels.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {butterModels.map(m => (
                    <ModelCard 
                      key={m.name} 
                      model={m} 
                      openLink={openLink} 
                      progress={pullProgresses[m.repoName]}
                      onInstall={handleInstallModel}
                      onCancel={handleCancelInstall}
                      onDelete={handleDeleteModel}
                    />
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-xs text-muted-foreground border border-dashed border-border rounded-2xl bg-card">
                  No models match this category in the Recommended tier.
                </div>
              )}
            </div>

            {/* Tier 2: Struggles but works */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-amber-500">
                <AlertTriangle className="h-5 w-5" />
                <h3 className="text-base font-bold">Compatible: May Struggle but Works</h3>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/10 uppercase font-semibold">High system load</span>
              </div>

              {struggleModels.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {struggleModels.map(m => (
                    <ModelCard 
                      key={m.name} 
                      model={m} 
                      openLink={openLink} 
                      progress={pullProgresses[m.repoName]}
                      onInstall={handleInstallModel}
                      onCancel={handleCancelInstall}
                      onDelete={handleDeleteModel}
                    />
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-xs text-muted-foreground border border-dashed border-border rounded-2xl bg-card">
                  No models match this category in the "Struggles but Works" tier.
                </div>
              )}
            </div>

            {/* Tier 3: Collapsible Unrecommended list */}
            {unrecommendedModels.length > 0 && (
              <div className="space-y-3 pt-2">
                <button
                  onClick={() => setShowUnrecommended(!showUnrecommended)}
                  className="w-full flex items-center justify-between p-3.5 bg-secondary/30 hover:bg-secondary/50 border border-border/60 rounded-xl transition-colors duration-150 text-xs font-semibold text-muted-foreground"
                >
                  <div className="flex items-center gap-2 text-red-500/90">
                    <XCircle className="h-4 w-4" />
                    <span>Show {unrecommendedModels.length} Unrecommended Models (Requires High-End Hardware)</span>
                  </div>
                  {showUnrecommended ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>

                {showUnrecommended && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in">
                    {unrecommendedModels.map(m => (
                      <ModelCard 
                        key={m.name} 
                        model={m} 
                        openLink={openLink} 
                        progress={pullProgresses[m.repoName]}
                        onInstall={handleInstallModel}
                        onCancel={handleCancelInstall}
                        onDelete={handleDeleteModel}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
