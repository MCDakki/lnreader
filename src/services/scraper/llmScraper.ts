/**
 * Auto-healing LLM scraper pipeline:
 *
 *   chapter URL
 *     → fetchSanitizedChapterHtml   (GET + cheerio strip-down)
 *     → parseChapterWithLlm         (local llama.rn, strict JSON)
 *     → parsedChapterToHtml         (reader-ready HTML string)
 *
 * The resulting HTML enters the existing reader flow unchanged:
 * useChapter → sanitizeChapterText → chapterText state → WebView.
 * Because it is source-agnostic, this pipeline keeps working when a
 * site redesign breaks a plugin's CSS selectors — hence auto-healing.
 */
import { fetchSanitizedChapterHtml } from './htmlFetcher';
import {
  htmlBudgetChars,
  parseChapterWithLlm,
  ParsedChapter,
} from './llmChapterParser';
import { getLlamaEngineSettings } from '@services/llm/llamaEngine';

const escapeHtmlText = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Render the model's structured output as chapter HTML. */
export const parsedChapterToHtml = (parsed: ParsedChapter): string => {
  const title = parsed.title ? `<h1>${escapeHtmlText(parsed.title)}</h1>\n` : '';
  const body = parsed.content
    .map(paragraph => `<p>${escapeHtmlText(paragraph)}</p>`)
    .join('\n');
  return title + body;
};

/** True when the LLM scraper should handle chapter fetches. */
export const isLlmScraperEnabled = (): boolean =>
  getLlamaEngineSettings().enabled;

/** Scrape a chapter URL into structured {title, content[]} JSON. */
export const scrapeChapter = async (url: string): Promise<ParsedChapter> => {
  const { contextSize } = getLlamaEngineSettings();
  const page = await fetchSanitizedChapterHtml(
    url,
    htmlBudgetChars(contextSize),
  );
  return parseChapterWithLlm(page.html, page.pageTitle);
};

/**
 * Scrape a chapter URL and return reader-ready HTML — the drop-in
 * replacement for the deprecated `plugin.parseChapter` output.
 */
export const fetchChapterViaLlm = async (url: string): Promise<string> => {
  return parsedChapterToHtml(await scrapeChapter(url));
};
