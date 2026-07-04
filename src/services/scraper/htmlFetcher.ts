/**
 * Universal HTML fetcher for the LLM scraper pipeline.
 *
 * Performs a plain GET against a chapter URL and aggressively strips
 * the document down to the bare structural text of `<body>` so the
 * payload fits a small local model's context window: no scripts, no
 * styles, no chrome (nav/header/footer/aside), no SVG, no attributes,
 * no comments — just content-bearing tags and their text.
 */
import * as cheerio from 'cheerio';
import { fetchText } from '@plugins/helpers/fetch';

/**
 * Tags whose entire subtree is noise for chapter extraction.
 * script/style/nav/header/footer/aside/svg are contractual; the rest
 * are equally content-free and only burn context tokens.
 */
export const STRIPPED_TAGS = [
  'script',
  'style',
  'nav',
  'header',
  'footer',
  'aside',
  'svg',
  'noscript',
  'iframe',
  'form',
  'button',
  'input',
  'select',
  'option',
  'textarea',
  'template',
  'canvas',
  'video',
  'audio',
  'source',
  'object',
  'embed',
  'img',
  'picture',
  'figure',
  'link',
  'meta',
  'dialog',
] as const;

export interface SanitizedPage {
  /** Minimal structural HTML of the page body. */
  html: string;
  /** `<title>` text — a cheap hint for the model's title extraction. */
  pageTitle: string;
}

/**
 * Reduce a raw HTML document to minimal structural body text.
 *
 * @param maxChars hard cap on the returned HTML length; sanitized
 * output beyond it is truncated (≈3 chars/token budgeting is done by
 * the caller against the engine's context size).
 */
export const sanitizeHtmlForLlm = (
  rawHtml: string,
  maxChars: number = Infinity,
): SanitizedPage => {
  const $ = cheerio.load(rawHtml);
  const pageTitle = $('head > title').first().text().trim();

  const $body = $('body');
  $body.find(STRIPPED_TAGS.join(',')).remove();

  $body.find('*').each((_, el) => {
    if (el.type !== 'tag') {
      return;
    }
    // Attributes (classes, ids, inline styles, tracking data-*) carry
    // almost no signal for a 4B parser compared to their token cost.
    el.attribs = {};
  });

  // Drop elements that end up with no text at all (icon wrappers,
  // emptied containers), then serialize and collapse whitespace.
  $body
    .find('div,section,article,main,span,ul,ol,table,p,a,li')
    .each((_, el) => {
      const $el = $(el);
      if (!$el.text().trim()) {
        $el.remove();
      }
    });

  let html = ($body.html() ?? '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();

  if (html.length > maxChars) {
    html = html.slice(0, maxChars);
    // Never end mid-tag — the model copes badly with a torn token soup.
    const lastOpen = html.lastIndexOf('<');
    if (lastOpen > html.lastIndexOf('>')) {
      html = html.slice(0, lastOpen);
    }
  }

  return { html, pageTitle };
};

/**
 * GET a web-novel chapter URL and return its sanitized body HTML.
 * Uses the app's fetch helper so the configured User-Agent (and any
 * saved cookies) apply, same as the WebView.
 */
export const fetchSanitizedChapterHtml = async (
  url: string,
  maxChars?: number,
): Promise<SanitizedPage> => {
  const rawHtml = await fetchText(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
    },
  });
  if (!rawHtml) {
    throw new Error(`Failed to fetch chapter page: ${url}`);
  }
  const page = sanitizeHtmlForLlm(rawHtml, maxChars);
  if (!page.html) {
    throw new Error(`Chapter page has no readable body content: ${url}`);
  }
  return page;
};
