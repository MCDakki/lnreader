/**
 * On-device translation engine.
 *
 * Same segment-marker protocol as the remote engine in translator.ts
 * (numbered `<<<SEG_N>>>` markers, batch packing, originals kept on
 * failure), but inference runs on the shared llama.rn context instead
 * of an HTTP endpoint — fully offline, built for the overnight batch
 * translation queue.
 */
import { completeText, getLlamaEngineSettings } from '@services/llm/llamaEngine';
import {
  buildBatches,
  buildSystemPrompt,
  cleanModelOutput,
  parseSegmentedResponse,
  SEGMENT_MARKER,
} from '@services/translation/translator';
import { translateChapterHtmlWith } from '@services/translation/translateHtml';
import { sleep } from '@utils/sleep';

/** Attempts per batch (1 initial + 1 retry). */
const MAX_BATCH_ATTEMPTS = 2;
const RETRY_BACKOFF_MS = 1000;

export interface LocalTranslationResult {
  /** Same length/order as the input; originals kept on failed batches. */
  paragraphs: string[];
  /** Paragraphs actually replaced with a translation. */
  translatedCount: number;
  /** Paragraphs that carried translatable text. */
  totalCount: number;
}

export type BatchProgressCallback = (
  doneBatches: number,
  totalBatches: number,
) => void;

/**
 * Character budget per prompt batch, derived from the model's context
 * window: reserve ~512 tokens for the system prompt + chat template
 * scaffolding, split the rest 50/50 between prompt and completion,
 * and budget ~2 chars per token so CJK-heavy source text stays safe.
 */
export const translationBatchChars = (contextSize: number): number =>
  Math.max(1500, Math.floor((contextSize - 512) / 2) * 2);

/** Completion token cap for one batch — the output half of the split. */
export const translationMaxTokens = (contextSize: number): number =>
  Math.floor((contextSize - 512) / 2);

const requestLocalTranslation = async (
  texts: string[],
  targetLanguage: string,
  maxTokens: number,
): Promise<string[]> => {
  const payload = texts
    .map((text, i) => `${SEGMENT_MARKER(i + 1)}\n${text}`)
    .join('\n');
  const output = await completeText(
    [
      { role: 'system', content: buildSystemPrompt(targetLanguage) },
      { role: 'user', content: payload },
    ],
    maxTokens,
  );
  return parseSegmentedResponse(cleanModelOutput(output), texts.length);
};

/**
 * Translate paragraphs on the local model. Batches run sequentially
 * (one shared llama context), each batch gets a retry on a malformed
 * response, and failed batches keep their original text — this never
 * rejects for translation-quality reasons, only for engine-level
 * failures (no model file, init failure) raised by llama.rn itself.
 */
export const translateParagraphsLocal = async (
  paragraphs: string[],
  targetLanguage: string,
  onProgress?: BatchProgressCallback,
): Promise<LocalTranslationResult> => {
  const { contextSize } = getLlamaEngineSettings();
  const maxTokens = translationMaxTokens(contextSize);
  const result = [...paragraphs];
  const batches = buildBatches(paragraphs, translationBatchChars(contextSize));
  const totalCount = batches.reduce((sum, batch) => sum + batch.length, 0);
  let translatedCount = 0;

  for (const [batchIndex, batch] of batches.entries()) {
    const texts = batch.map(index => paragraphs[index]);
    for (let attempt = 1; attempt <= MAX_BATCH_ATTEMPTS; attempt++) {
      try {
        const translated = await requestLocalTranslation(
          texts,
          targetLanguage,
          maxTokens,
        );
        batch.forEach((paragraphIndex, i) => {
          result[paragraphIndex] = translated[i];
        });
        translatedCount += batch.length;
        break;
      } catch (error) {
        // Engine-level failures (no model on device, init failure)
        // won't get better on retry — surface them to the caller.
        if ((error as Error)?.name === 'LlamaEngineError') {
          throw error;
        }
        if (attempt === MAX_BATCH_ATTEMPTS) {
          break; // keep originals for this batch
        }
        await sleep(RETRY_BACKOFF_MS);
      }
    }
    onProgress?.(batchIndex + 1, batches.length);
  }

  return { paragraphs: result, translatedCount, totalCount };
};

/**
 * Translate chapter HTML on the local model, preserving markup.
 * Returns the reassembled HTML plus segment counts so callers can
 * tell a real translation from an all-batches-failed passthrough.
 */
export const translateChapterHtmlLocal = async (
  html: string,
  targetLanguage: string,
  onProgress?: BatchProgressCallback,
): Promise<{ html: string; translatedCount: number; totalCount: number }> => {
  let translatedCount = 0;
  let totalCount = 0;
  const translatedHtml = await translateChapterHtmlWith(html, async texts => {
    const result = await translateParagraphsLocal(
      texts,
      targetLanguage,
      onProgress,
    );
    translatedCount = result.translatedCount;
    totalCount = result.totalCount;
    return result.paragraphs;
  });
  return { html: translatedHtml, translatedCount, totalCount };
};
