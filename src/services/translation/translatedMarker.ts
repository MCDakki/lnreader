/**
 * Marker stamped onto chapter HTML that the batch queue has already
 * translated, so the reader's Auto-Translate never re-translates it
 * and re-queued tasks can skip finished chapters.
 *
 * The marker is a `data-*` attribute on a wrapper div — NOT just an
 * HTML comment — because the reader pipes saved chapter HTML through
 * `sanitizeChapterText` (which strips comments) before any consumer
 * sees it, while `data-*` attributes and `div` are allowlisted there.
 * The comment is kept purely as an on-disk breadcrumb.
 */
export const TRANSLATED_ATTR = 'data-lnreader-translated';
export const TRANSLATED_COMMENT = '<!-- lnreader:translated -->';

export const markTranslatedHtml = (html: string): string =>
  `${TRANSLATED_COMMENT}\n<div ${TRANSLATED_ATTR}="true">\n${html}\n</div>`;

export const isTranslatedHtml = (html: string): boolean =>
  html.includes(TRANSLATED_ATTR);
