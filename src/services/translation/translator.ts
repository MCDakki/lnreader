/**
 * Translation engine — fully on-device.
 *
 * Feeds arrays of novel paragraphs into the local llama.rn context
 * (see localEngine.ts) and returns the translated array. No network
 * traffic is involved at inference time.
 *
 * Guarantees:
 * - The returned array always has the same length/order as the input.
 * - On any unrecoverable inference failure, the original untranslated
 *   paragraphs are returned for the affected batch — never a rejection.
 */
import { DEFAULT_TRANSLATION_MODEL_URL } from './constants';
import { completeChat } from './localEngine';

export interface TranslationConfig {
  /** GGUF source URL; identifies the local model file to run. */
  modelUrl: string;
  /** Target language name used in the system prompt. */
  targetLanguage: string;
  /**
   * Character budget per inference batch. The runtime context is
   * n_ctx 2048 shared between system prompt (~250 tokens), input and
   * output; CJK source text runs ≈1 token per character, so 1600
   * chars keeps prompt + translation inside the window.
   */
  maxBatchChars: number;
  /** Attempts per batch (1 initial + retries with backoff). */
  maxAttempts: number;
  /** Max tokens the model may generate per batch. */
  nPredict: number;
}

export const DEFAULT_TRANSLATION_CONFIG: TranslationConfig = {
  modelUrl: DEFAULT_TRANSLATION_MODEL_URL,
  targetLanguage: 'English',
  maxBatchChars: 1600,
  maxAttempts: 2,
  nPredict: 1200,
};

const SEGMENT_MARKER = (n: number) => `<<<SEG_${n}>>>`;
const SEGMENT_MARKER_RE = /<<<SEG_(\d+)>>>/g;

const buildSystemPrompt = (targetLanguage: string) =>
  `You are a machine translation engine embedded in an e-book reader. Translate every segment of the user's input into ${targetLanguage}.

STRICT OUTPUT RULES — follow ALL of them:
1. Output ONLY the translated text. No greetings, no explanations, no apologies, no translator's notes, no summaries, no markdown code fences, no formatting of your own.
2. The input is divided by numbered markers of the form <<<SEG_N>>>. Reproduce every marker EXACTLY as written, each on its own line, followed by the translation of that segment's text. Never add, drop, merge, split, renumber or reorder markers.
3. Translate faithfully: keep names, numbers, honorifics and inline punctuation. Do not summarize, censor, embellish or modernize the prose.
4. If a segment is already in ${targetLanguage}, or contains no translatable text (symbols, scene breaks like "***"), copy it through unchanged under its marker.
5. Never address the reader and never comment on the content. Your entire response must consist of markers and translated text only.`;

/** True when the string carries translatable content (has letters). */
const isTranslatable = (text: string): boolean => /\p{L}/u.test(text);

/** Strip reasoning tags, stray code fences and outer whitespace. */
const cleanModelOutput = (raw: string): string =>
  raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^\s*```[a-z]*\s*\n?/i, '')
    .replace(/\n?```\s*$/, '')
    .trim();

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Greedily pack paragraph indices into batches under the character
 * budget. An oversized single paragraph still gets its own batch.
 */
export const buildBatches = (
  paragraphs: string[],
  maxBatchChars: number,
): number[][] => {
  const batches: number[][] = [];
  let current: number[] = [];
  let currentSize = 0;
  paragraphs.forEach((text, index) => {
    if (!isTranslatable(text)) {
      return; // passed through untouched, never sent to the model
    }
    if (current.length > 0 && currentSize + text.length > maxBatchChars) {
      batches.push(current);
      current = [];
      currentSize = 0;
    }
    current.push(index);
    currentSize += text.length;
  });
  if (current.length > 0) {
    batches.push(current);
  }
  return batches;
};

/**
 * Parse a marker-delimited model response back into a map of
 * segment number → translated text. Throws when any expected
 * segment is missing so the caller can retry.
 */
export const parseSegmentedResponse = (
  output: string,
  expectedCount: number,
): string[] => {
  const parts: string[] = [];
  const matches = [...output.matchAll(SEGMENT_MARKER_RE)];
  for (const [i, match] of matches.entries()) {
    const segmentNumber = Number(match[1]);
    const start = match.index! + match[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index! : output.length;
    const text = output.slice(start, end).trim();
    if (segmentNumber >= 1 && segmentNumber <= expectedCount && text) {
      parts[segmentNumber - 1] = text;
    }
  }
  for (let i = 0; i < expectedCount; i++) {
    if (parts[i] === undefined) {
      throw new Error(
        `Malformed translation response: segment ${
          i + 1
        } of ${expectedCount} missing`,
      );
    }
  }
  return parts.slice(0, expectedCount);
};

const requestTranslation = async (
  texts: string[],
  config: TranslationConfig,
): Promise<string[]> => {
  const payload = texts
    .map((text, i) => `${SEGMENT_MARKER(i + 1)}\n${text}`)
    .join('\n');

  const output = await completeChat(
    [
      { role: 'system', content: buildSystemPrompt(config.targetLanguage) },
      { role: 'user', content: payload },
    ],
    {
      modelUrl: config.modelUrl,
      nPredict: config.nPredict,
      temperature: 0.1,
    },
  );

  return parseSegmentedResponse(cleanModelOutput(output), texts.length);
};

/**
 * Translate an array of paragraphs on-device.
 *
 * Batches run sequentially (the llama context is a single stream),
 * each batch retries with backoff on malformed output, and any batch
 * that ultimately fails falls back to its original text.
 * Non-translatable paragraphs ("***" separators, whitespace…) are
 * passed through as-is.
 */
export const translateParagraphs = async (
  paragraphs: string[],
  overrides?: Partial<TranslationConfig>,
  signal: AbortSignal = new AbortController().signal,
): Promise<string[]> => {
  const config: TranslationConfig = {
    ...DEFAULT_TRANSLATION_CONFIG,
    ...overrides,
  };
  const result = [...paragraphs];
  const batches = buildBatches(paragraphs, config.maxBatchChars);

  for (const batch of batches) {
    if (signal.aborted) {
      break; // caller no longer cares; leave the rest untranslated
    }
    const texts = batch.map(index => paragraphs[index]);
    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      try {
        const translated = await requestTranslation(texts, config);
        batch.forEach((paragraphIndex, i) => {
          result[paragraphIndex] = translated[i];
        });
        break;
      } catch {
        if (signal.aborted || attempt === config.maxAttempts) {
          break; // keep originals for this batch
        }
        await sleep(1000 * 2 ** (attempt - 1));
      }
    }
  }
  return result;
};
