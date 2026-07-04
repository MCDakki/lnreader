import {
  TranslationConfig,
  translateParagraphs,
} from '@services/translation/translator';

/**
 * Translate the text nodes of a sanitized chapter HTML string while
 * preserving every tag, attribute and inline structure exactly.
 *
 * The HTML is tokenized into alternating tag/text tokens; only text
 * tokens containing letters are sent to the API (as the paragraph
 * array), then spliced back in place with their original surrounding
 * whitespace. If the API fails, `translateParagraphs` returns the
 * original strings, so the reassembled HTML equals the input.
 */
export const translateChapterHtml = async (
  html: string,
  overrides?: Partial<TranslationConfig>,
  signal?: AbortSignal,
): Promise<string> => {
  // Split into tags (captured) and text-between-tags.
  const tokens = html.split(/(<[^>]*>)/g);

  const textTokenIndices: number[] = [];
  const texts: string[] = [];
  const whitespace: Array<[string, string]> = [];

  tokens.forEach((token, index) => {
    if (!token || token.startsWith('<') || !/\p{L}/u.test(token)) {
      return;
    }
    const match = token.match(/^(\s*)([\s\S]*?)(\s*)$/)!;
    textTokenIndices.push(index);
    whitespace.push([match[1], match[3]]);
    texts.push(match[2]);
  });

  if (texts.length === 0) {
    return html;
  }

  const translated = await translateParagraphs(texts, overrides, signal);

  textTokenIndices.forEach((tokenIndex, i) => {
    const [leading, trailing] = whitespace[i];
    tokens[tokenIndex] = leading + translated[i] + trailing;
  });

  return tokens.join('');
};
