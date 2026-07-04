import React, { createContext, useContext, useMemo, useRef } from 'react';
import { ChapterInfo, NovelInfo } from '@database/types';
import WebView from 'react-native-webview';
import useChapter from './hooks/useChapter';
import useChapterTextInterceptor from './hooks/useChapterTextInterceptor';

type ChapterContextType = ReturnType<typeof useChapter> & {
  novel: NovelInfo;
  webViewRef: React.RefObject<WebView<{}> | null>;
  translating: boolean;
};

const defaultValue = {} as ChapterContextType;

const ChapterContext = createContext<ChapterContextType>(defaultValue);

export function ChapterContextProvider({
  children,
  novel,
  initialChapter,
}: {
  children: React.JSX.Element;
  novel: NovelInfo;
  initialChapter: ChapterInfo;
}) {
  const webViewRef = useRef<WebView>(null);
  const chapterHookContent = useChapter(webViewRef, initialChapter, novel);

  // Auto-Translate interception point: swaps the rendered text (and
  // holds the loading screen) without touching useChapter itself.
  const { chapterText, translating } = useChapterTextInterceptor(
    chapterHookContent.chapterText,
    chapterHookContent.chapter,
  );

  const contextValue = useMemo(
    () => ({
      novel,
      webViewRef,
      ...chapterHookContent,
      chapterText,
      translating,
      loading: chapterHookContent.loading || translating,
    }),
    [novel, webViewRef, chapterHookContent, chapterText, translating],
  );

  return (
    <ChapterContext.Provider value={contextValue}>
      {children}
    </ChapterContext.Provider>
  );
}

export const useChapterContext = () => {
  return useContext(ChapterContext);
};
