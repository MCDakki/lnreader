import { useEffect, useRef, useState } from 'react';

import { ChapterInfo } from '@database/types';
import {
  initialChapterGeneralSettings,
  useChapterGeneralSettings,
} from '@hooks/persisted/useSettings';
import { translateChapterHtml } from '@services/translation/translateHtml';

/**
 * In-memory cache of translated chapters, so toggling the setting or
 * revisiting a chapter in the same session doesn't re-hit the API.
 * Keyed by chapter id; entries also remember the source text so a
 * refetched/changed chapter invalidates naturally.
 */
const translatedCache = new Map<number, { source: string; html: string }>();

interface InterceptedChapterText {
  /** Text to render: translated HTML when ready, original otherwise. */
  chapterText: string;
  /** True while a translation request is in flight for this chapter. */
  translating: boolean;
}

/**
 * Intercepts the chapter text between `useChapter` and the render
 * layer (see docs/reader-architecture.md §4, "ChapterContext" option).
 *
 * When Auto-Translate is off this is a pass-through. When on, the
 * sanitized chapter HTML is routed through the translation engine and
 * the translated HTML is swapped in; the translation engine guarantees
 * fallback to the original text on API failure, so the reader can
 * never end up blank.
 */
export default function useChapterTextInterceptor(
  chapterText: string,
  chapter: ChapterInfo,
): InterceptedChapterText {
  const settings = useChapterGeneralSettings();
  // Older installs may lack the new keys in their persisted object.
  const autoTranslate =
    settings.autoTranslate ?? initialChapterGeneralSettings.autoTranslate;
  const apiUrl =
    settings.translationApiUrl ||
    initialChapterGeneralSettings.translationApiUrl;
  const model =
    settings.translationModel || initialChapterGeneralSettings.translationModel;
  const targetLanguage =
    settings.translationTargetLanguage ||
    initialChapterGeneralSettings.translationTargetLanguage;

  const [translated, setTranslated] = useState<{
    chapterId: number;
    source: string;
    html: string;
  } | null>(null);
  const [translating, setTranslating] = useState(false);
  const jobRef = useRef(0);

  useEffect(() => {
    // Invalidate any in-flight job whenever inputs change.
    const job = ++jobRef.current;

    if (!autoTranslate || !chapterText) {
      setTranslating(false);
      return;
    }

    const cached = translatedCache.get(chapter.id);
    if (cached?.source === chapterText) {
      setTranslated({
        chapterId: chapter.id,
        source: chapterText,
        html: cached.html,
      });
      setTranslating(false);
      return;
    }

    const abort = new AbortController();
    setTranslating(true);
    translateChapterHtml(
      chapterText,
      { apiUrl, model, targetLanguage },
      abort.signal,
    )
      .then(html => {
        if (jobRef.current !== job) {
          return;
        }
        translatedCache.set(chapter.id, { source: chapterText, html });
        setTranslated({ chapterId: chapter.id, source: chapterText, html });
      })
      .catch(() => {
        /* engine already falls back internally; render original */
      })
      .finally(() => {
        if (jobRef.current === job) {
          setTranslating(false);
        }
      });

    return () => abort.abort();
  }, [autoTranslate, chapterText, chapter.id, apiUrl, model, targetLanguage]);

  const translationReady =
    autoTranslate &&
    translated?.chapterId === chapter.id &&
    translated.source === chapterText;

  return {
    chapterText: translationReady ? translated.html : chapterText,
    translating: autoTranslate && translating,
  };
}
