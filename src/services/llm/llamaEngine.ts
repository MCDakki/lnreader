/**
 * On-device LLM engine built on llama.rn (llama.cpp bindings).
 *
 * Owns a single shared `LlamaContext` running the local GGUF model
 * (Qwen3 4B by default). The context is initialized lazily on first
 * use and re-initialized only when the model path or context size
 * setting changes — model load is expensive (seconds + RAM), so all
 * callers share one context.
 *
 * The model file itself is NOT bundled in the APK (a 4B GGUF is
 * multiple GB). It is looked up on device storage:
 *   1. `llmModelPath` from ChapterGeneralSettings, when set, or
 *   2. the first `.gguf` file found in `{ROOT_STORAGE}/Models/`.
 */
import { initLlama, LlamaContext, RNLlamaOAICompatibleMessage } from 'llama.rn';
import NativeFile from '@specs/NativeFile';
import { getMMKVObject } from '@utils/mmkv/mmkv';
import {
  CHAPTER_GENERAL_SETTINGS,
  ChapterGeneralSettings,
  initialChapterGeneralSettings,
} from '@hooks/persisted/useSettings';
import { ROOT_STORAGE } from '@utils/Storages';

export const MODELS_DIR = `${ROOT_STORAGE}/Models`;

/** Sanitized chapter HTML must fit; 4096 is the contract minimum. */
export const MIN_CONTEXT_SIZE = 4096;

export class LlamaEngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlamaEngineError';
  }
}

export interface LlamaEngineSettings {
  enabled: boolean;
  modelPath: string;
  contextSize: number;
}

/** Read the persisted engine settings outside of React. */
export const getLlamaEngineSettings = (): LlamaEngineSettings => {
  const settings =
    getMMKVObject<ChapterGeneralSettings>(CHAPTER_GENERAL_SETTINGS) ??
    initialChapterGeneralSettings;
  return {
    enabled: settings.llmScraper ?? initialChapterGeneralSettings.llmScraper,
    modelPath:
      settings.llmModelPath ?? initialChapterGeneralSettings.llmModelPath,
    contextSize: Math.max(
      MIN_CONTEXT_SIZE,
      settings.llmContextSize ?? initialChapterGeneralSettings.llmContextSize,
    ),
  };
};

/** Explicit setting first, then any .gguf dropped into /Models. */
const resolveModelPath = (configuredPath: string): string | null => {
  if (configuredPath) {
    return NativeFile.exists(configuredPath) ? configuredPath : null;
  }
  try {
    NativeFile.mkdir(MODELS_DIR);
    const gguf = NativeFile.readDir(MODELS_DIR).find(
      entry => !entry.isDirectory && entry.name.toLowerCase().endsWith('.gguf'),
    );
    return gguf?.path ?? null;
  } catch {
    return null;
  }
};

let context: LlamaContext | null = null;
let contextKey = '';
let initPromise: Promise<LlamaContext> | null = null;

const initContext = async (
  modelPath: string,
  contextSize: number,
): Promise<LlamaContext> => {
  if (context) {
    await context.release().catch(() => {});
    context = null;
  }
  context = await initLlama({
    model: modelPath,
    n_ctx: contextSize,
    n_batch: 512,
    n_gpu_layers: 0, // CPU-only: works on every device, no Vulkan surprises
    use_mlock: false,
    use_mmap: true,
  });
  contextKey = `${modelPath}::${contextSize}`;
  return context;
};

/**
 * Get the shared inference context, (re)loading the model if needed.
 * Throws `LlamaEngineError` when no usable model file is on device.
 */
export const getLlamaContext = async (): Promise<LlamaContext> => {
  const { modelPath: configuredPath, contextSize } = getLlamaEngineSettings();
  const modelPath = resolveModelPath(configuredPath);
  if (!modelPath) {
    throw new LlamaEngineError(
      `No GGUF model found. Set a model path in settings or place a .gguf file in ${MODELS_DIR}`,
    );
  }
  const key = `${modelPath}::${contextSize}`;
  if (context && contextKey === key) {
    return context;
  }
  if (!initPromise) {
    initPromise = initContext(modelPath, contextSize).finally(() => {
      initPromise = null;
    });
  }
  return initPromise;
};

/**
 * Run a chat completion on the local model, constrained to emit a
 * JSON object (llama.cpp grammar-enforced via response_format).
 * Returns the raw model text — parsing/validation is the caller's job.
 */
export const completeJson = async (
  messages: RNLlamaOAICompatibleMessage[],
  maxTokens: number = 2048,
): Promise<string> => {
  const llama = await getLlamaContext();
  const result = await llama.completion({
    messages,
    response_format: { type: 'json_object' },
    temperature: 0.1,
    top_p: 0.9,
    n_predict: maxTokens,
    // Qwen3 ships a jinja chat template; jinja is required both for
    // response_format grammar enforcement and to disable <think> mode.
    jinja: true,
    enable_thinking: false,
  });
  return result.text;
};

/**
 * Run a plain-text chat completion on the local model (no JSON
 * grammar). Used by the local translation engine, where the output is
 * marker-delimited prose rather than a JSON object.
 */
export const completeText = async (
  messages: RNLlamaOAICompatibleMessage[],
  maxTokens: number = 2048,
): Promise<string> => {
  const llama = await getLlamaContext();
  const result = await llama.completion({
    messages,
    temperature: 0.1,
    top_p: 0.9,
    n_predict: maxTokens,
    jinja: true,
    enable_thinking: false,
  });
  return result.text;
};

/** Free the model and its KV cache (e.g. on memory pressure). */
export const releaseLlamaContext = async (): Promise<void> => {
  if (context) {
    await context.release().catch(() => {});
    context = null;
    contextKey = '';
  }
};
