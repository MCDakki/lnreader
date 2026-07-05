import {
  TranslationConfig,
  translateParagraphs,
} from '@services/translation/translator';

/** Translates an array of text segments, preserving length and order. */
export type ParagraphTranslator = (texts: string[]) => Promise<string[]>;

/**
 * Translate the text nodes of a sanitized chapter HTML string while
 * preserving every tag, attribute and inline structure exactly.
 *
 * The HTML is tokenized into alternating tag/text tokens; only text
 * tokens containing letters are handed to `translate` (as the
 * paragraph array), then spliced back in place with their original
 * surrounding whitespace. The translator must return the original
 * strings for segments it could not translate, so the reassembled
 * HTML degrades to the input rather than breaking.
 */
export const translateChapterHtmlWith = async (
  html: string,
  translate: ParagraphTranslator,
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

  const translated = await translate(texts);

  textTokenIndices.forEach((tokenIndex, i) => {
    const [leading, trailing] = whitespace[i];
    tokens[tokenIndex] = leading + translated[i] + trailing;
  });

  return tokens.join('');
};

/** Translate chapter HTML through the remote (Ollama/OpenAI) engine. */
export const translateChapterHtml = (
  html: string,
  overrides?: Partial<TranslationConfig>,
  signal?: AbortSignal,
): Promise<string> =>
  translateChapterHtmlWith(html, texts =>
    translateParagraphs(texts, overrides, signal),
  );
