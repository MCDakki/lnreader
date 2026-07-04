/**
 * Translation API engine.
 *
 * Sends arrays of novel paragraphs to a local/self-hosted LLM endpoint
 * (Ollama `/api/chat`, or any OpenAI-compatible `/v1/chat/completions`
 * server) and returns the translated array.
 *
 * Guarantees:
 * - The returned array always has the same length/order as the input.
 * - On any unrecoverable API failure, the original untranslated
 *   paragraphs are returned for the affected batch — never a rejection.
 */

export interface TranslationConfig {
  /** Full endpoint URL, e.g. `http://127.0.0.1:11434/api/chat`. */
  apiUrl: string;
  /** Model tag, e.g. `qwen3:4b` or `gemma3:4b`. */
  model: string;
  /** Target language name used in the system prompt. */
  targetLanguage: string;
  /** Optional bearer token for OpenAI-compatible servers. */
  apiKey?: string;
  /**
   * Character budget per request batch. ~4 chars ≈ 1 token, so the
   * default 6000 keeps prompt + completion well inside a 4B model's
   * 8k context window.
   */
  maxBatchChars: number;
  /** Attempts per batch (1 initial + retries with backoff). */
  maxAttempts: number;
  /** Per-request timeout. Small local models can be slow — be generous. */
  timeoutMs: number;
}

export const DEFAULT_TRANSLATION_CONFIG: TranslationConfig = {
  apiUrl: 'http://127.0.0.1:11434/api/chat',
  model: 'qwen3:4b',
  targetLanguage: 'English',
  maxBatchChars: 6000,
  maxAttempts: 3,
  timeoutMs: 120_000,
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

/** Strip reasoning tags (Qwen3), stray code fences and outer whitespace. */
const cleanModelOutput = (raw: string): string =>
  raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^\s*```[a-z]*\s*\n?/i, '')
    .replace(/\n?```\s*$/, '')
    .trim();

/** Pull the assistant text out of Ollama chat / generate or OpenAI shapes. */
const extractContent = (data: any): string => {
  const content =
    data?.message?.content ??
    data?.choices?.[0]?.message?.content ??
    data?.response;
  if (typeof content !== 'string') {
    throw new Error('Unrecognized API response shape');
  }
  return content;
};

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
      return; // passed through untouched, never sent to the API
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
  signal: AbortSignal,
): Promise<string[]> => {
  const payload = texts
    .map((text, i) => `${SEGMENT_MARKER(i + 1)}\n${text}`)
    .join('\n');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  const onOuterAbort = () => controller.abort();
  signal.addEventListener('abort', onOuterAbort);

  try {
    const response = await fetch(config.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey
          ? { Authorization: `Bearer ${config.apiKey}` }
          : undefined),
      },
      body: JSON.stringify({
        model: config.model,
        stream: false,
        // Qwen3: skip the <think> phase; ignored by other models/servers.
        think: false,
        options: { temperature: 0.1 },
        temperature: 0.1,
        messages: [
          { role: 'system', content: buildSystemPrompt(config.targetLanguage) },
          { role: 'user', content: payload },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Translation API HTTP ${response.status}`);
    }
    const output = cleanModelOutput(extractContent(await response.json()));
    return parseSegmentedResponse(output, texts.length);
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', onOuterAbort);
  }
};

/**
 * Translate an array of paragraphs.
 *
 * Batches sequentially (local inference servers dislike concurrency),
 * retries each batch with exponential backoff, and falls back to the
 * original text for any batch that ultimately fails. Non-translatable
 * paragraphs (whitespace, "***" separators…) are passed through as-is.
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
        const translated = await requestTranslation(texts, config, signal);
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
