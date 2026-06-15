import { LLMProvider, ChatParams, StreamChunk } from './providers/base';
import { OllamaProvider } from './providers/ollama';
import { LMStudioProvider } from './providers/lmstudio';
import { JanProvider } from './providers/jan';
import { GPT4AllProvider } from './providers/gpt4all';
import { LlamaCppProvider } from './providers/llamacpp';
import { OpenAICompatibleProvider } from './providers/openai-compatible';
import { AnthropicProvider } from './providers/anthropic';
import { insertTaskResult, updateRunFinished } from './db';
import crypto from 'crypto';

export type ScorerType = 'exact' | 'contains' | 'regex' | 'numeric' | 'length' | 'custom' | 'syllogism' | 'palindrome' | 'codingbug' | 'countries' | 'translation' | 'context' | 'haiku';

export interface BenchmarkTask {
  id: string;
  category: 'speed' | 'reasoning' | 'coding' | 'instruction' | 'context' | 'creative';
  name: string;
  description: string;
  prompt: string;
  systemPrompt?: string;
  temperature: number;       // 0 for deterministic, 0.7 for creative
  maxTokens: number;
  timeoutMs: number;         // default 120s
  expectedOutput?: string;
  scorerType: ScorerType;
}

export interface TaskResult {
  id: string;
  runId: string;
  taskId: string;
  modelId: string;
  provider: string;
  score: number;             // 0.0–1.0 quality score
  ttft: number;              // ms
  tps: number;               // tokens/sec
  totalLatency: number;      // ms
  promptTokens: number;
  completionTokens: number;
  rawResponse: string;
  error?: string;
  timestamp: number;
}

// ----------------------------------------------------
// SCORING ENGINE
// ----------------------------------------------------

export interface Scorer {
  score(response: string, task: BenchmarkTask): number;
}

class ExactScorer implements Scorer {
  score(response: string, task: BenchmarkTask): number {
    if (!task.expectedOutput) return 0;
    const cleanRes = response.trim().toLowerCase().replace(/\s+/g, ' ');
    const cleanExp = task.expectedOutput.trim().toLowerCase().replace(/\s+/g, ' ');
    return cleanRes === cleanExp ? 1.0 : 0.0;
  }
}

class ContainsScorer implements Scorer {
  score(response: string, task: BenchmarkTask): number {
    if (!task.expectedOutput) return 1.0; // default pass if nothing expected
    const keywords = task.expectedOutput.toLowerCase().split(',').map(s => s.trim());
    const cleanRes = response.toLowerCase();
    
    let matched = 0;
    for (const kw of keywords) {
      if (cleanRes.includes(kw)) matched++;
    }
    return keywords.length > 0 ? matched / keywords.length : 1.0;
  }
}

class RegexScorer implements Scorer {
  score(response: string, task: BenchmarkTask): number {
    if (!task.expectedOutput) return 0;
    try {
      const regex = new RegExp(task.expectedOutput, 'i');
      return regex.test(response) ? 1.0 : 0.0;
    } catch {
      return 0;
    }
  }
}

class NumericScorer implements Scorer {
  score(response: string, task: BenchmarkTask): number {
    if (!task.expectedOutput) return 0;
    const cleanRes = response.replace(/,/g, '');
    const numberMatches = cleanRes.match(/[-+]?[0-9]*\.?[0-9]+/g);
    if (!numberMatches) return 0.0;
    
    const target = parseFloat(task.expectedOutput);
    for (const m of numberMatches) {
      const val = parseFloat(m);
      if (val === target) return 1.0;
      // Close match check (within 2%)
      if (Math.abs(val - target) / target < 0.02) {
        return 0.5;
      }
    }
    return 0.0;
  }
}

// Custom scorers for specialized built-in tasks

class SyllogismScorer implements Scorer {
  score(response: string, task: BenchmarkTask): number {
    // 5 questions, expected: Yes, No, Yes, Yes, No (or whatever standard we define)
    const answers = ["yes", "no", "yes", "yes", "no"];
    const cleanRes = response.toLowerCase().replace(/\*\*|__|\*|_/g, '');
    const lines = cleanRes.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    let score = 0;
    // Look for yes/no in sequence or general text
    for (let i = 0; i < answers.length; i++) {
      // Find if line or phrase i matches the expected
      const match = cleanRes.match(new RegExp(`(?:${i+1}\\.\\s*|syllogism\\s*${i+1}\\s*[:.-]?\\s*)(yes|no)`, 'i'));
      if (match && match[1] === answers[i]) {
        score += 0.2;
      } else {
        // Fallback: search lines for keywords
        const foundLine = lines.find(l => l.includes(`${i+1}.`) || l.includes(`syllogism ${i+1}`));
        if (foundLine && foundLine.includes(answers[i])) {
          score += 0.2;
        }
      }
    }

    // Direct text search fallback if numbered list isn't detected
    if (score === 0) {
      let matchedCount = 0;
      for (const ans of answers) {
        if (cleanRes.includes(ans)) matchedCount++;
      }
      return matchedCount / 10; // low score if unstructured
    }

    return score;
  }
}

class PalindromeCodingScorer implements Scorer {
  score(response: string, task: BenchmarkTask): number {
    let score = 0;
    
    // Checks for docstring (0.3)
    if (response.includes('"""') || response.includes("'''")) {
      score += 0.3;
    }
    
    // Checks for unit tests/asserts (0.3)
    if (response.includes('assert ') || response.includes('unittest') || response.includes('pytest') || response.includes('test_')) {
      score += 0.3;
    }

    // Logic checks (0.4)
    // Check if there is python function definition def is_palindrome
    const hasDef = response.toLowerCase().includes('def ') && response.toLowerCase().includes('palindrome');
    const hasReverse = response.includes('[::-1]') || response.includes('reversed') || response.toLowerCase().includes('replace');
    
    if (hasDef && hasReverse) {
      score += 0.4;
    } else if (hasDef || hasReverse) {
      score += 0.2;
    }
    
    return score;
  }
}

class CodingBugScorer implements Scorer {
  score(response: string, task: BenchmarkTask): number {
    const cleanRes = response.toLowerCase();
    let score = 0;
    
    // Identifies bug (off-by-one or starting at 1) (0.5)
    if (cleanRes.includes('off-by-one') || cleanRes.includes('start') || cleanRes.includes('index') || cleanRes.includes('range(0') || cleanRes.includes('range(n)')) {
      score += 0.5;
    }
    
    // Fixes bug (0.3)
    if (cleanRes.includes('range(0, n)') || cleanRes.includes('range(n)') || cleanRes.includes('range(len(') || cleanRes.includes('elements.append(arr[i-1])')) {
      score += 0.3;
    }
    
    // Explains clearly (0.2)
    if (cleanRes.length > 50) {
      score += 0.2;
    }
    
    return score;
  }
}

class CountriesScorer implements Scorer {
  score(response: string, task: BenchmarkTask): number {
    const europeanCountries = [
      'france', 'germany', 'italy', 'spain', 'united kingdom', 'uk', 'poland', 'ukraine',
      'romania', 'netherlands', 'belgium', 'greece', 'portugal', 'sweden', 'austria',
      'switzerland', 'norway', 'denmark', 'finland', 'ireland', 'croatia', 'slovakia',
      'bulgaria', 'hungary', 'czech', 'estonia', 'latvia', 'lithuania', 'slovenia'
    ];
    
    // Clean markdown bold/italic tags
    const cleanText = response.replace(/\*\*|__|\*|_/g, '');
    const lines = cleanText.split('\n')
      .map(l => l.trim().toLowerCase())
      .filter(l => l.length > 0);
      
    let numberedLines = 0;
    let validEuropean = 0;
    
    for (let i = 1; i <= 5; i++) {
      // Find line matching prefix like "1." or "1)" or "- 1."
      const line = lines.find(l => {
        const stripped = l.replace(/^[-*+\s]+/, '').trim();
        return stripped.startsWith(`${i}.`) || stripped.startsWith(`${i})`);
      });
      
      if (line) {
        numberedLines++;
        const hasEuro = europeanCountries.some(c => line.includes(c));
        if (hasEuro) {
          validEuropean++;
        }
      }
    }
    
    // Alternate check: if it is just a 5-line list (with bullets or numbers)
    if (numberedLines < 5 && lines.length === 5) {
      numberedLines = 5;
      validEuropean = 0;
      for (const line of lines) {
        const hasEuro = europeanCountries.some(c => line.includes(c));
        if (hasEuro) {
          validEuropean++;
        }
      }
    }
    
    let score = 0;
    if (lines.length === 5) score += 0.2;
    if (numberedLines === 5) score += 0.4;
    score += (validEuropean / 5) * 0.4;
    
    return Math.min(1.0, score);
  }
}

class TranslationScorer implements Scorer {
  score(response: string, task: BenchmarkTask): number {
    const cleanRes = response.toLowerCase();
    let score = 0;
    
    // Headers correct (0.3)
    if (cleanRes.includes('french:') && cleanRes.includes('spanish:')) {
      score += 0.3;
    }
    
    // Translations present (0.5)
    // French: "Le chat était assis sur le tapis" or similar
    const hasFrench = cleanRes.includes('chat') && (cleanRes.includes('tapis') || cleanRes.includes('nappe') || cleanRes.includes('mat'));
    // Spanish: "El gato se sentó en la alfombra" or similar
    const hasSpanish = cleanRes.includes('gato') && (cleanRes.includes('alfombra') || cleanRes.includes('estera') || cleanRes.includes('tapete'));
    
    if (hasFrench && hasSpanish) {
      score += 0.5;
    } else if (hasFrench || hasSpanish) {
      score += 0.25;
    }
    
    // Translations accurate (0.2)
    if (cleanRes.includes('assis') || cleanRes.includes('se sentó') || cleanRes.includes('sento')) {
      score += 0.2;
    }
    
    return score;
  }
}

class LongContextScorer implements Scorer {
  score(response: string, task: BenchmarkTask): number {
    // We expect answers containing specific details:
    // Q1: "Aethelgard"
    // Q2: "712 AD"
    // Q3: "Luminari crystal"
    // Q4: "Zephyrus"
    // Q5: "obsidian key"
    const keywords = ["aethelgard", "712", "luminari", "zephyrus", "obsidian"];
    const cleanRes = response.toLowerCase();
    
    let correct = 0;
    for (const kw of keywords) {
      if (cleanRes.includes(kw)) {
        correct++;
      }
    }
    return (correct / keywords.length);
  }
}

class HaikuScorer implements Scorer {
  score(response: string, task: BenchmarkTask): number {
    const lines = response.split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);
      
    let score = 0;
    // 3 lines (0.3)
    if (lines.length === 3) score += 0.3;
    else if (lines.length >= 2 && lines.length <= 4) score += 0.15;
    
    // Syllables roughly check (0.4) - word count is a proxy
    const wordCounts = lines.map(l => l.split(/\s+/).length);
    const totalWords = wordCounts.reduce((a, b) => a + b, 0);
    // Standard haiku has 17 syllables, around 10-14 words
    if (totalWords >= 8 && totalWords <= 16) {
      score += 0.4;
    } else if (totalWords >= 5 && totalWords <= 20) {
      score += 0.2;
    }
    
    // AI Theme (0.3)
    const cleanRes = response.toLowerCase();
    const aiKeywords = ['ai', 'artificial', 'intelligence', 'silicon', 'code', 'metal', 'byte', 'mind', 'machine', 'circuit', 'chip', 'robot', 'think'];
    const hasTheme = aiKeywords.some(kw => cleanRes.includes(kw));
    if (hasTheme) {
      score += 0.3;
    }
    
    return score;
  }
}

class LengthScorer implements Scorer {
  score(response: string, task: BenchmarkTask): number {
    if (!task.expectedOutput) return response.length > 0 ? 1.0 : 0.0;
    const targetLength = parseInt(task.expectedOutput, 10);
    if (isNaN(targetLength)) return response.length > 0 ? 1.0 : 0.0;
    const ratio = response.length / targetLength;
    // Score 1.0 if within 20%, gradient down to 0 outside 2x/0.5x
    if (ratio >= 0.8 && ratio <= 1.2) return 1.0;
    if (ratio >= 0.5 && ratio <= 2.0) return 0.5;
    return 0.0;
  }
}

const SCORERS: Record<string, Scorer> = {
  exact: new ExactScorer(),
  contains: new ContainsScorer(),
  regex: new RegexScorer(),
  numeric: new NumericScorer(),
  length: new LengthScorer(),
  syllogism: new SyllogismScorer(),
  palindrome: new PalindromeCodingScorer(),
  codingbug: new CodingBugScorer(),
  countries: new CountriesScorer(),
  translation: new TranslationScorer(),
  context: new LongContextScorer(),
  haiku: new HaikuScorer()
};

export function getScorer(type: string): Scorer {
  return SCORERS[type] ?? SCORERS.contains;
}

// ----------------------------------------------------
// BUILT-IN TASKS
// ----------------------------------------------------

export const BUILT_IN_TASKS: BenchmarkTask[] = [
  {
    id: "speed-tps",
    category: "speed",
    name: "Speed & Throughput Summary",
    description: "Measures TTFT and tokens per second using a long 512-token context passage.",
    prompt: "Read the following passage and write a concise 1-sentence summary of it. Do not write any introduction or explanation.\n\n" +
            "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. ".repeat(6),
    temperature: 0.0,
    maxTokens: 128,
    timeoutMs: 120000,
    scorerType: "contains"
  },
  {
    id: "reasoning-apples",
    category: "reasoning",
    name: "Apple Math Arithmetic",
    description: "Simple multi-step math word problem with fractional values.",
    prompt: "If you have 3 apples and give away 1.5 apples, then buy 4 more, how many do you have? Show your working clearly and state the final number.",
    temperature: 0.0,
    maxTokens: 256,
    timeoutMs: 120000,
    expectedOutput: "5.5",
    scorerType: "numeric"
  },
  {
    id: "reasoning-syllogisms",
    category: "reasoning",
    name: "Syllogisms Logic Test",
    description: "Set of 5 deductive reasoning syllogisms to test logic coherence.",
    prompt: "Answer the following 5 logic questions with either 'Yes' or 'No' on separate lines. Number them 1 to 5.\n\n" +
            "1. All mammals breathe air. Whales are mammals. Do whales breathe air?\n" +
            "2. No reptiles have fur. Snakes are reptiles. Do snakes have fur?\n" +
            "3. If all cats love fish, and Leo is a cat, does Leo love fish?\n" +
            "4. All flowers need water. Roses are flowers. Do roses need water?\n" +
            "5. No birds are insects. Eagles are birds. Are eagles insects?",
    temperature: 0.0,
    maxTokens: 128,
    timeoutMs: 120000,
    scorerType: "syllogism"
  },
  {
    id: "coding-palindrome",
    category: "coding",
    name: "Palindrome Python Function",
    description: "Write a standard palindrome check function in Python with docstrings and unit tests.",
    prompt: "Write a Python function that checks if a string is a palindrome (ignoring spaces and case). Include docstring and unit tests. Do not include markdown code fence formatting or explanations if possible, just write the python code.",
    temperature: 0.0,
    maxTokens: 512,
    timeoutMs: 120000,
    scorerType: "palindrome"
  },
  {
    id: "coding-bug",
    category: "coding",
    name: "Off-by-One Debugging",
    description: "Identify and resolve an off-by-one array index bug in a Python helper.",
    prompt: "Debug this python code and explain the bug. Provide the corrected code.\n\n" +
            "def get_first_n_elements(arr, n):\n" +
            "    elements = []\n" +
            "    for i in range(1, n + 1):\n" +
            "        elements.append(arr[i])\n" +
            "    return elements",
    temperature: 0.0,
    maxTokens: 512,
    timeoutMs: 120000,
    scorerType: "codingbug"
  },
  {
    id: "instruction-countries",
    category: "instruction",
    name: "European Countries List",
    description: "Follows strict structural guidelines: list exactly 5 European countries, one per line, numbered.",
    prompt: "List exactly 5 countries in Europe, one per line, numbered 1-5, no other text.",
    temperature: 0.0,
    maxTokens: 128,
    timeoutMs: 120000,
    scorerType: "countries"
  },
  {
    id: "instruction-translation",
    category: "instruction",
    name: "French & Spanish Translation",
    description: "Follows strict header formatting guidelines while translating a sentence.",
    prompt: "Translate the following to French, then Spanish. Use headers 'French:' and 'Spanish:'. Text: 'The cat sat on the mat.'",
    temperature: 0.0,
    maxTokens: 128,
    timeoutMs: 120000,
    scorerType: "translation"
  },
  {
    id: "context-reading",
    category: "context",
    name: "Factual Retrieval (2000 words)",
    description: "Asks 5 specific details hidden in a long fictive story passage.",
    prompt: "Read the story below and answer these 5 questions briefly: \n" +
            "1. What is the name of the ancient lost city?\n" +
            "2. In what year was the chronicle written?\n" +
            "3. What was the glowing crystal named?\n" +
            "4. Who was the leader of the expedition?\n" +
            "5. What object was needed to unlock the final gate?\n\n" +
            "--- STORY ---\n" +
            "Many ages ago, in the year 712 AD, a scribe named Eldon penned the history of the lost city of Aethelgard. " +
            "It was said that deep in the cavern of the Whispering Peaks, the explorers found a pulsing crystal of immense power, " +
            "known to the local scholars as the Luminari crystal. A grand expedition was mounted to retrieve it, led by the brave voyager " +
            "Zephyrus. They fought through storms and guardian golems. Finally, they reached the sanctum gate. Zephyrus realized " +
            "the gate could only be unlocked with a dark, polished obsidian key. " +
            "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(180), // extend the text
    temperature: 0.0,
    maxTokens: 256,
    timeoutMs: 180000,
    scorerType: "context"
  },
  {
    id: "creative-haiku",
    category: "creative",
    name: "AI Haiku Poem",
    description: "Checks formatting, word constraints, and AI theme alignment.",
    prompt: "Write a haiku about artificial intelligence. Output only the haiku (3 lines), no other text.",
    temperature: 0.7,
    maxTokens: 128,
    timeoutMs: 120000,
    scorerType: "haiku"
  }
];

// ----------------------------------------------------
// ACTIVE RUNNER ORCHESTRATION
// ----------------------------------------------------

interface ActiveBenchmarkRun {
  runId: string;
  abortController: AbortController;
  isCancelled: boolean;
}

const activeRuns = new Map<string, ActiveBenchmarkRun>();

export function cancelBenchmarkRun(runId: string) {
  const active = activeRuns.get(runId);
  if (active) {
    active.isCancelled = true;
    active.abortController.abort();
    activeRuns.delete(runId);
  }
}

export interface BenchmarkConfig {
  models: Array<{ id: string; provider: string; url?: string }>;
  tasks: string[]; // task IDs
  concurrency: number; // tasks run per model concurrently
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  apiKeys?: {
    openai?: string;
    anthropic?: string;
    gemini?: string;
    openrouter?: string;
  };
}

export async function runBenchmarkSuite(
  runId: string,
  config: BenchmarkConfig,
  customTasks: BenchmarkTask[],
  onProgress: (event: { type: string; payload: any }) => void
) {
  const abortController = new AbortController();
  activeRuns.set(runId, { runId, abortController, isCancelled: false });

  try {
    // Instantiate adapter mapping
  const providersCache = new Map<string, LLMProvider>();
  
  const getProviderInstance = (providerName: string, url?: string): LLMProvider => {
    const cacheKey = `${providerName}:${url ?? 'default'}`;
    if (providersCache.has(cacheKey)) {
      return providersCache.get(cacheKey)!;
    }

    let prov: LLMProvider;
    switch (providerName) {
      case "Ollama":
        prov = new OllamaProvider(url);
        break;
      case "LM Studio":
        prov = new LMStudioProvider(url);
        break;
      case "Jan":
        prov = new JanProvider(url);
        break;
      case "GPT4All":
        prov = new GPT4AllProvider(url);
        break;
      case "llama.cpp":
        prov = new LlamaCppProvider(url);
        break;
      case "OpenAI":
        prov = new OpenAICompatibleProvider("OpenAI", "https://api.openai.com", config.apiKeys?.openai);
        break;
      case "Gemini":
        prov = new OpenAICompatibleProvider("Gemini", "https://generativelanguage.googleapis.com/v1beta/openai", config.apiKeys?.gemini);
        break;
      case "OpenRouter":
        prov = new OpenAICompatibleProvider("OpenRouter", "https://openrouter.ai", config.apiKeys?.openrouter);
        break;
      case "Anthropic":
        prov = new AnthropicProvider(config.apiKeys?.anthropic);
        break;
      default:
        prov = new OpenAICompatibleProvider(providerName, url ?? "http://localhost:8080");
    }
    
    providersCache.set(cacheKey, prov);
    return prov;
  };

  const tasksList = [
    ...BUILT_IN_TASKS,
    ...customTasks
  ].filter(t => config.tasks.includes(t.id));

  const modelSelection = config.models;
  const totalTasks = tasksList.length * modelSelection.length;
  let completedCount = 0;

  // Track tasks completed times for rolling average ETA
  const taskDurations: number[] = [];

  onProgress({
    type: 'started',
    payload: { runId, totalTasks }
  });

  // Run models sequentially (one after another) to avoid overloading RAM/VRAM
  for (const modelSel of modelSelection) {
    if (abortController.signal.aborted) break;

    const provider = getProviderInstance(modelSel.provider, modelSel.url);
    
    // Check provider availability
    const available = await provider.isAvailable();
    if (!available) {
      // Mark all tasks as unavailable for this model
      for (const task of tasksList) {
        if (abortController.signal.aborted) break;
        
        const tr: TaskResult = {
          id: crypto.randomUUID(),
          runId,
          taskId: task.id,
          modelId: modelSel.id,
          provider: modelSel.provider,
          score: 0.0,
          ttft: 0,
          tps: 0,
          totalLatency: 0,
          promptTokens: 0,
          completionTokens: 0,
          rawResponse: "",
          error: "MODEL_UNAVAILABLE",
          timestamp: Date.now()
        };

        insertTaskResult({
          id: tr.id,
          runId: tr.runId,
          taskId: tr.taskId,
          modelId: tr.modelId,
          provider: tr.provider,
          score: null,
          ttftMs: null,
          tps: null,
          totalLatencyMs: 0,
          promptTokens: 0,
          completionTokens: 0,
          rawResponse: null,
          error: "MODEL_UNAVAILABLE",
          createdAt: tr.timestamp
        });
        
        completedCount++;
        onProgress({
          type: 'task_complete',
          payload: { result: tr, progress: completedCount / totalTasks }
        });
      }
      continue;
    }

    // Run tasks sequentially for this model
    for (const task of tasksList) {
      if (abortController.signal.aborted) break;

      const taskStartTime = Date.now();
      
      onProgress({
        type: 'task_start',
        payload: { modelId: modelSel.id, taskId: task.id }
      });

      let responseText = "";
      let firstTokenTime = 0;
      let lastTokenTime = 0;
      let ttft = 0;
      let errorStr: string | undefined;

      const taskTimeout = task.timeoutMs ?? config.timeoutMs ?? 120000;
      const taskAbortController = new AbortController();
      const timeoutId = setTimeout(() => {
        taskAbortController.abort();
      }, taskTimeout);

      const combinedController = new AbortController();
      const handleAbort = () => combinedController.abort();

      try {
        abortController.signal.addEventListener('abort', handleAbort);
        taskAbortController.signal.addEventListener('abort', handleAbort);
        if (abortController.signal.aborted || taskAbortController.signal.aborted) {
          combinedController.abort();
        }

        const chatParams: ChatParams = {
          model: modelSel.id,
          messages: [
            ...(task.systemPrompt ? [{ role: "system", content: task.systemPrompt }] : []),
            { role: "user", content: task.prompt }
          ],
          temperature: config.temperature ?? task.temperature,
          maxTokens: config.maxTokens ?? task.maxTokens,
        };

        // We run stream to measure TTFT and TPS accurately
        const stream = provider.chatStream(
          chatParams,
          combinedController.signal
        );

        const requestSentTime = Date.now();

        for await (const chunk of stream) {
          if (firstTokenTime === 0 && chunk.content) {
            firstTokenTime = Date.now();
            ttft = firstTokenTime - requestSentTime;
          }
          responseText += chunk.content;
          lastTokenTime = Date.now();
        }

        clearTimeout(timeoutId);
      } catch (err: any) {
        clearTimeout(timeoutId);
        if (taskAbortController.signal.aborted) {
          errorStr = "TIMEOUT";
        } else if (abortController.signal.aborted) {
          errorStr = "CANCELLED";
        } else {
          errorStr = err?.message ?? "UNKNOWN_ERROR";
        }
      } finally {
        abortController.signal.removeEventListener('abort', handleAbort);
        taskAbortController.signal.removeEventListener('abort', handleAbort);
      }

      const duration = Date.now() - taskStartTime;
      taskDurations.push(duration);

      // Scoring
      let score = 0;
      let tps = 0;
      let promptTokensEstimate = Math.ceil(task.prompt.split(/\s+/).length * 1.3);
      let completionTokensEstimate = Math.ceil(responseText.split(/\s+/).filter(Boolean).length * 1.3);

      if (!errorStr) {
        try {
          const scorer = getScorer(task.scorerType);
          score = scorer.score(responseText, task);
        } catch (scoringErr) {
          console.error("Scoring error:", scoringErr);
          score = 0;
        }

        // Measure TPS: start the timer on first token received (not on request send).
        // TPS = completionTokens / ((lastTokenTime - firstTokenTime) / 1000)
        const activeGenerationTimeMs = lastTokenTime - firstTokenTime;
        if (activeGenerationTimeMs > 0 && completionTokensEstimate > 0) {
          tps = completionTokensEstimate / (activeGenerationTimeMs / 1000);
        } else if (duration > 0 && completionTokensEstimate > 0) {
          tps = completionTokensEstimate / (duration / 1000);
        }
      }

      const tr: TaskResult = {
        id: crypto.randomUUID(),
        runId,
        taskId: task.id,
        modelId: modelSel.id,
        provider: modelSel.provider,
        score: errorStr ? 0.0 : score,
        ttft: errorStr ? 0 : ttft,
        tps: errorStr ? 0 : Math.round(tps * 10) / 10,
        totalLatency: duration,
        promptTokens: promptTokensEstimate,
        completionTokens: errorStr ? 0 : completionTokensEstimate,
        rawResponse: responseText,
        error: errorStr,
        timestamp: Date.now()
      };

      // Store partial results immediately
      insertTaskResult({
        ...tr,
        score: errorStr ? null : tr.score,
        ttftMs: errorStr ? null : tr.ttft,
        tps: errorStr ? null : tr.tps,
        totalLatencyMs: tr.totalLatency,
        promptTokens: tr.promptTokens,
        completionTokens: errorStr ? null : tr.completionTokens,
        rawResponse: tr.rawResponse || null,
        error: tr.error || null,
        createdAt: tr.timestamp
      });

      completedCount++;
      
      // Calculate average duration for rolling average ETA
      const avgDuration = taskDurations.reduce((a, b) => a + b, 0) / taskDurations.length;
      const remainingTasks = totalTasks - completedCount;
      const etaMs = remainingTasks * avgDuration;

      onProgress({
        type: 'task_complete',
        payload: {
          result: tr,
          progress: completedCount / totalTasks,
          etaMs
        }
      });
    }
  }

  // If cancelled, don't send finished event (frontend already set status to cancelled)
  const active = activeRuns.get(runId);
  if (active?.isCancelled) {
    activeRuns.delete(runId);
    return;
  }

  // Update finished time in runs table
  updateRunFinished(runId, Date.now());

  onProgress({
    type: 'finished',
    payload: { runId }
  });

  } finally {
    activeRuns.delete(runId);
  }
}
