/**
 * Background worker for the batch translation queue.
 *
 * One task = one chapter: make sure its content is on disk (running
 * the LLM-scraper download path if it isn't), translate it on the
 * local llama.rn model, then persist the translation over index.html
 * while keeping the original as source.html.
 *
 * Failure policy: errors are swallowed into the task meta instead of
 * thrown. ServiceManager posts a system notification per thrown task,
 * and an overnight queue with a broken model must not wake the user
 * with hundreds of them; a failed chapter simply stays untranslated
 * (its original content is untouched). The shared llama context also
 * serializes with the reader's scraper — concurrent reading just adds
 * latency, never corruption.
 */
import { getChapter } from '@database/queries/ChapterQueries';
import { getNovelById } from '@database/queries/NovelQueries';
import { getPlugin } from '@plugins/pluginManager';
import { getString } from '@strings/translations';
import { getMMKVObject } from '@utils/mmkv/mmkv';
import { sleep } from '@utils/sleep';
import { NOVEL_STORAGE } from '@utils/Storages';
import NativeFile from '@specs/NativeFile';
import {
  CHAPTER_GENERAL_SETTINGS,
  ChapterGeneralSettings,
  initialChapterGeneralSettings,
} from '@hooks/persisted/useSettings';
import { BackgroundTaskMetadata } from '@services/ServiceManager';
import { ensureChapterHtml } from '@services/download/downloadChapter';
import { translateChapterHtmlLocal } from '@services/translation/localTranslator';
import {
  isTranslatedHtml,
  markTranslatedHtml,
} from '@services/translation/translatedMarker';

export interface TranslateChapterTaskData {
  chapterId: number;
  novelName: string;
  chapterName: string;
}

/** Cooldown between chapters so sustained inference doesn't cook the SoC. */
const TRANSLATION_COOLDOWN_MS = 3000;
/** Attempts per chapter (scrape + translate), on top of per-batch retries. */
const MAX_ATTEMPTS = 2;
const ATTEMPT_BACKOFF_MS = 2000;

export const translateChapter = async (
  data: TranslateChapterTaskData,
  setMeta: (
    transformer: (meta: BackgroundTaskMetadata) => BackgroundTaskMetadata,
  ) => void,
): Promise<void> => {
  setMeta(meta => ({
    ...meta,
    isRunning: true,
    progressText: data.chapterName,
  }));

  const finish = (progressText?: string, failed: boolean = false) => {
    setMeta(meta => ({
      ...meta,
      progress: failed ? undefined : 1,
      progressText: progressText ?? meta.progressText,
      isRunning: false,
    }));
  };

  const chapter = await getChapter(data.chapterId);
  if (!chapter) {
    finish(`Chapter not found: ${data.chapterId}`, true);
    return;
  }
  const novel = await getNovelById(chapter.novelId);
  if (!novel) {
    finish(`Novel not found for: ${chapter.name}`, true);
    return;
  }
  const plugin = getPlugin(novel.pluginId);
  if (!plugin) {
    finish(getString('downloadScreen.pluginNotFound'), true);
    return;
  }

  const folder = `${NOVEL_STORAGE}/${novel.pluginId}/${novel.id}/${chapter.id}`;
  const indexPath = `${folder}/index.html`;
  const sourcePath = `${folder}/source.html`;

  // Idempotency: re-queued batches and post-crash re-runs skip
  // chapters that already carry the translated marker.
  if (NativeFile.exists(indexPath)) {
    const existing = NativeFile.readFile(indexPath);
    if (isTranslatedHtml(existing)) {
      finish();
      return;
    }
  }

  const settings =
    getMMKVObject<ChapterGeneralSettings>(CHAPTER_GENERAL_SETTINGS) ??
    initialChapterGeneralSettings;
  const targetLanguage =
    settings.translationTargetLanguage ||
    initialChapterGeneralSettings.translationTargetLanguage;

  let lastError = '';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const sourceHtml = await ensureChapterHtml(chapter, novel, plugin);
      const { html, translatedCount } = await translateChapterHtmlLocal(
        sourceHtml,
        targetLanguage,
        (done, total) =>
          setMeta(meta => ({
            ...meta,
            progress: done / total,
            progressText: `${data.chapterName} (${done}/${total})`,
          })),
      );
      if (translatedCount === 0) {
        throw new Error('No segments translated');
      }
      if (!NativeFile.exists(sourcePath)) {
        NativeFile.writeFile(sourcePath, sourceHtml);
      }
      NativeFile.writeFile(indexPath, markTranslatedHtml(html));
      lastError = '';
      break;
    } catch (error: any) {
      lastError = error?.message ?? String(error);
      if (attempt < MAX_ATTEMPTS) {
        await sleep(ATTEMPT_BACKOFF_MS);
      }
    }
  }

  await sleep(TRANSLATION_COOLDOWN_MS);

  if (lastError) {
    finish(`${data.chapterName}: ${lastError}`, true);
    return;
  }
  finish(data.chapterName);
};
