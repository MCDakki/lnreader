import React, { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import WebView, { WebViewMessageEvent } from 'react-native-webview';

import { getUserAgent } from '@hooks/persisted/useUserAgent';
import {
  SCRAPED_CHAPTER_MESSAGE,
  WEBVIEW_SCRAPER_JS,
} from '@services/scraper/scraperInjection';

interface HiddenWebviewScraperProps {
  url: string;
  onScraped: (paragraphs: string[]) => void;
  onFail: (message: string) => void;
  /** Native-side hard deadline; must exceed the in-page MAX_WAIT_MS. */
  timeoutMs?: number;
}

/**
 * Invisible 1×1 WebView mounted behind the loading screen when the
 * plugin's network request fails. Loads the chapter URL with the app's
 * browser user agent (surviving basic anti-bot walls the raw fetch
 * cannot), runs the DOM scraper, and reports back exactly once.
 */
const HiddenWebviewScraper: React.FC<HiddenWebviewScraperProps> = ({
  url,
  onScraped,
  onFail,
  timeoutMs = 35_000,
}) => {
  const settledRef = useRef(false);

  const settle = (action: () => void) => {
    if (!settledRef.current) {
      settledRef.current = true;
      action();
    }
  };

  useEffect(() => {
    settledRef.current = false;
    const timer = setTimeout(
      () => settle(() => onFail('WebView fallback timed out')),
      timeoutMs,
    );
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, timeoutMs]);

  const handleMessage = (event: WebViewMessageEvent) => {
    let data: any;
    try {
      data = JSON.parse(event.nativeEvent.data);
    } catch {
      return; // page scripts can postMessage arbitrary payloads
    }
    if (data?.type !== SCRAPED_CHAPTER_MESSAGE) {
      return;
    }
    if (data.ok && Array.isArray(data.paragraphs) && data.paragraphs.length) {
      settle(() => onScraped(data.paragraphs.map(String)));
    } else {
      settle(() => onFail(data.error || 'WebView scraper found no content'));
    }
  };

  return (
    <WebView
      source={{ uri: url }}
      style={styles.hidden}
      containerStyle={styles.hidden}
      userAgent={getUserAgent()}
      injectedJavaScript={WEBVIEW_SCRAPER_JS}
      onMessage={handleMessage}
      onError={({ nativeEvent }) =>
        settle(() =>
          onFail(nativeEvent.description || 'WebView failed to load'),
        )
      }
      javaScriptEnabled
      domStorageEnabled
      thirdPartyCookiesEnabled
      setSupportMultipleWindows={false}
      androidLayerType="none"
      pointerEvents="none"
    />
  );
};

export default HiddenWebviewScraper;

const styles = StyleSheet.create({
  hidden: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
});
