/**
 * LLM chapter parser: feeds sanitized chapter HTML to the local
 * llama.rn engine and turns its strict-JSON reply into a typed
 * `ParsedChapter`.
 *
 * The model is grammar-constrained to a JSON object (see
 * `completeJson`), but a 4B model can still hallucinate malformed
 * output — everything coming back from inference goes through the
 * defensive `parseModelJson` wrapper, never a bare `JSON.parse`.
 */
import {
  completeJson,
  getLlamaEngineSettings,
} from '@services/llm/llamaEngine';

export interface ParsedChapter {
  /** Chapter title as printed on the page. */
  title: string;
  /** Chapter body, one paragraph of plain text per entry. */
  content: string[];
}

/**
 * System prompt forcing strict-JSON extraction. Kept terse on
 * purpose: every token here is context the 4B model no longer has
 * for the chapter itself.
 */
export const CHAPTER_PARSER_SYSTEM_PROMPT = `You are an HTML content extraction engine inside an e-book reader. The user gives you the stripped-down HTML of a web-novel chapter page. Extract the chapter and reply with ONE JSON object, nothing else.

Output schema:
{"title": "<chapter title>", "content": ["<paragraph 1>", "<paragraph 2>", ...]}

Rules:
1. Output ONLY the JSON object. No markdown fences, no commentary, no keys other than "title" and "content".
2. "content" holds every paragraph of the chapter's story text, in reading order, as plain text without HTML tags.
3. EXCLUDE site chrome and junk: menus, chapter lists, comments, ratings, ads, share buttons, copyright/watermark lines, "read on site X" spam, next/previous links.
4. KEEP the story text exactly as written. Do not summarize, censor, rewrite, translate or skip paragraphs. Author notes clearly attached to the chapter may be kept as trailing paragraphs.
5. "title" is the chapter's own title (e.g. "Chapter 12: The Hunt"). If none is visible, derive it from the page title; if that fails use "".
6. Escape characters as required by JSON (quotes, backslashes, newlines).`;

const buildUserPrompt = (html: string, pageTitle: string): string =>
  `Page title: ${pageTitle || '(unknown)'}\n\nHTML:\n${html}`;

/**
 * Defensive JSON extraction for small-model output.
 *
 * Tolerates <think> blocks, markdown code fences and stray prose
 * around the object; wraps `JSON.parse` in try/catch and shape-checks
 * the result. Returns null (never throws) on garbage.
 */
export const parseModelJson = (raw: string): ParsedChapter | null => {
  if (!raw) {
    return null;
  }
  let text = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```[a-z]*\s*/gi, '')
    .trim();

  // The object may be wrapped in chatter; parse the outermost braces.
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) {
    return null;
  }
  text = text.slice(start, end + 1);

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const candidate = value as { title?: unknown; content?: unknown };
  if (!Array.isArray(candidate.content)) {
    return null;
  }
  const content = candidate.content
    .filter((entry): entry is string => typeof entry === 'string')
    .map(entry => entry.trim())
    .filter(entry => entry.length > 0);
  if (content.length === 0) {
    return null;
  }
  return {
    title: typeof candidate.title === 'string' ? candidate.title.trim() : '',
    content,
  };
};

/**
 * Character budget for the sanitized HTML user payload, derived from
 * the configured context window: reserve tokens for the system
 * prompt (~350), the JSON completion (~2048) and chat scaffolding,
 * then budget ~3 chars per token for HTML-ish text.
 */
export const htmlBudgetChars = (contextSize: number): number => {
  const inputTokens = Math.max(1024, contextSize - 2048 - 512);
  return inputTokens * 3;
};

/**
 * Run the sanitized page through the local model. One retry: small
 * models occasionally emit a torn object on the first pass but
 * recover under the same grammar on a second sample.
 */
export const parseChapterWithLlm = async (
  html: string,
  pageTitle: string,
): Promise<ParsedChapter> => {
  const messages = [
    { role: 'system', content: CHAPTER_PARSER_SYSTEM_PROMPT },
    { role: 'user', content: buildUserPrompt(html, pageTitle) },
  ];
  let lastError = 'model returned malformed JSON';
  for (let attempt = 0; attempt < 2; attempt++) {
    let raw: string;
    try {
      raw = await completeJson(messages);
    } catch (error: any) {
      lastError = error?.message ?? String(error);
      break; // engine-level failure (no model, OOM) won't fix itself
    }
    const parsed = parseModelJson(raw);
    if (parsed) {
      return parsed;
    }
  }
  throw new Error(`LLM chapter parsing failed: ${lastError}`);
};

export { getLlamaEngineSettings };
