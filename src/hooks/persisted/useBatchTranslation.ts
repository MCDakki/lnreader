import { ChapterInfo, NovelInfo } from '@database/types';
import ServiceManager, {
  BackgroundTaskMetadata,
  QueuedBackgroundTask,
  TranslateChapterTask,
} from '@services/ServiceManager';
import { useMemo } from 'react';
import { useMMKVObject } from 'react-native-mmkv';

export default function useBatchTranslation() {
  const [queue] = useMMKVObject<QueuedBackgroundTask[]>(
    ServiceManager.manager.STORE_KEY,
  );

  const translationQueue = useMemo(
    () => queue?.filter(t => t.task?.name === 'TRANSLATE_CHAPTER') || [],
    [queue],
  ) as { task: TranslateChapterTask; meta: BackgroundTaskMetadata }[];

  const translatingChapterIds = useMemo(
    () => new Set(translationQueue.map(c => c.task.data.chapterId)),
    [translationQueue],
  );

  const translateChapters = (novel: NovelInfo, chapters: ChapterInfo[]) =>
    ServiceManager.manager.addTask(
      chapters.map(chapter => ({
        name: 'TRANSLATE_CHAPTER' as const,
        data: {
          chapterId: chapter.id,
          novelName: novel.name,
          chapterName: chapter.name,
        },
      })),
    );

  const cancelTranslation = () =>
    ServiceManager.manager.removeTasksByName('TRANSLATE_CHAPTER');

  return {
    translationQueue,
    translatingChapterIds,
    translateChapters,
    cancelTranslation,
  };
}
