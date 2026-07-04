/**
 * On-device translation engine backed by llama.rn.
 *
 * Owns two concerns:
 * 1. Model asset management — download the GGUF over HTTPS into the
 *    app's document directory with progress reporting, atomically
 *    (partial downloads land in a `.part` file and are only promoted
 *    on success).
 * 2. Inference runtime — a lazily-initialized singleton LlamaContext
 *    with S22-Ultra-tuned options, and a serialized `completeChat`
 *    queue (a llama context runs one completion at a time).
 */
import * as FileSystem from 'expo-file-system/legacy';
import {
  initLlama,
  LlamaContext,
  releaseAllLlama,
  RNLlamaOAICompatibleMessage,
} from 'llama.rn';

const MODEL_DIR = `${FileSystem.documentDirectory}models`;

export const getModelFileUri = (modelUrl: string): string => {
  const fileName =
    modelUrl.split('/').pop()?.split('?')[0] || 'translation-model.gguf';
  return `${MODEL_DIR}/${fileName}`;
};

export const isModelDownloaded = async (modelUrl: string): Promise<boolean> => {
  const info = await FileSystem.getInfoAsync(getModelFileUri(modelUrl));
  return info.exists && !info.isDirectory && (info.size ?? 0) > 0;
};

export const deleteModel = async (modelUrl: string): Promise<void> => {
  await releaseTranslationEngine();
  await FileSystem.deleteAsync(getModelFileUri(modelUrl), {
    idempotent: true,
  });
};

/* ------------------------------------------------------------------ */
/* First-boot downloader                                                */
/* ------------------------------------------------------------------ */

type ProgressListener = (fraction: number) => void;

let activeDownload: Promise<void> | null = null;
const progressListeners = new Set<ProgressListener>();

/**
 * Download the model GGUF. Concurrent callers share one underlying
 * download; every caller's progress listener receives updates.
 */
export const downloadModel = (
  modelUrl: string,
  onProgress?: ProgressListener,
): Promise<void> => {
  if (onProgress) {
    progressListeners.add(onProgress);
  }
  if (!activeDownload) {
    activeDownload = runDownload(modelUrl).finally(() => {
      activeDownload = null;
      progressListeners.clear();
    });
  }
  return activeDownload;
};

const runDownload = async (modelUrl: string): Promise<void> => {
  const target = getModelFileUri(modelUrl);
  const partial = `${target}.part`;

  await FileSystem.makeDirectoryAsync(MODEL_DIR, { intermediates: true }).catch(
    () => {
      /* already exists */
    },
  );
  // A previous crash may have left a stale partial file behind.
  await FileSystem.deleteAsync(partial, { idempotent: true });

  const resumable = FileSystem.createDownloadResumable(
    modelUrl,
    partial,
    {},
    ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
      const fraction =
        totalBytesExpectedToWrite > 0
          ? totalBytesWritten / totalBytesExpectedToWrite
          : 0;
      progressListeners.forEach(listener => listener(fraction));
    },
  );

  try {
    const result = await resumable.downloadAsync();
    if (!result || result.status < 200 || result.status >= 300) {
      throw new Error(
        `Model download failed (HTTP ${result?.status ?? 'unknown'})`,
      );
    }
    // Promote atomically so `isModelDownloaded` never sees a torso.
    await FileSystem.moveAsync({ from: partial, to: target });
  } catch (error) {
    await FileSystem.deleteAsync(partial, { idempotent: true });
    throw error;
  }
};

/* ------------------------------------------------------------------ */
/* llama.rn runtime                                                     */
/* ------------------------------------------------------------------ */

let contextPromise: Promise<LlamaContext> | null = null;
let contextModelUrl: string | null = null;

/**
 * Lazily initialize (and memoize) the inference context.
 *
 * Context options are tuned for Galaxy S22 Ultra-class Android
 * hardware:
 * - use_mlock pins model weights in RAM so Samsung's aggressive
 *   background memory management can't page them out mid-completion.
 * - n_ctx 2048 comfortably fits one web-novel chapter batch.
 * - n_gpu_layers 99 offloads every layer to the Adreno GPU (OpenCL);
 *   requires the libOpenCL.so uses-native-library manifest entry.
 */
export const getTranslationContext = (
  modelUrl: string,
): Promise<LlamaContext> => {
  if (!contextPromise || contextModelUrl !== modelUrl) {
    contextModelUrl = modelUrl;
    contextPromise = initLlama({
      model: getModelFileUri(modelUrl).replace(/^file:\/\//, ''),
      use_mlock: true,
      n_ctx: 2048,
      n_gpu_layers: 99,
    }).catch(error => {
      // Allow a retry after transient init failures (e.g. OOM).
      contextPromise = null;
      contextModelUrl = null;
      throw error;
    });
  }
  return contextPromise;
};

export const releaseTranslationEngine = async (): Promise<void> => {
  const pending = contextPromise;
  contextPromise = null;
  contextModelUrl = null;
  try {
    const context = await pending;
    await context?.release();
  } catch {
    /* context never initialized */
  }
  await releaseAllLlama().catch(() => {});
};

let completionQueue: Promise<unknown> = Promise.resolve();

export interface CompleteChatOptions {
  modelUrl: string;
  /** Max tokens to generate. */
  nPredict?: number;
  temperature?: number;
}

/**
 * Run one chat completion on the local model and return its text.
 * Calls are serialized: the context processes a single stream, so
 * overlapping requests (e.g. chapter prefetch + current chapter)
 * queue up instead of corrupting each other.
 */
export const completeChat = (
  messages: RNLlamaOAICompatibleMessage[],
  options: CompleteChatOptions,
): Promise<string> => {
  const run = completionQueue.then(async () => {
    const context = await getTranslationContext(options.modelUrl);
    const result = await context.completion({
      messages,
      n_predict: options.nPredict ?? 1024,
      temperature: options.temperature ?? 0.1,
      stop: ['<|im_end|>', '<|endoftext|>', '<end_of_turn>'],
    });
    return result.text;
  });
  // Keep the queue alive after failures; the caller sees the error.
  completionQueue = run.catch(() => {});
  return run;
};
