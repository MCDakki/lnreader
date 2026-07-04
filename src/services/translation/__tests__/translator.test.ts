import {
  buildBatches,
  parseSegmentedResponse,
  translateParagraphs,
} from '../translator';
import { translateChapterHtml } from '../translateHtml';

const ollamaResponse = (content: string) => ({
  ok: true,
  json: async () => ({ message: { content } }),
});

describe('buildBatches', () => {
  it('packs paragraphs greedily under the char budget', () => {
    const paragraphs = ['a'.repeat(40), 'b'.repeat(40), 'c'.repeat(40)];
    expect(buildBatches(paragraphs, 80)).toEqual([[0, 1], [2]]);
  });

  it('gives an oversized paragraph its own batch', () => {
    const paragraphs = ['a'.repeat(10), 'b'.repeat(500), 'c'.repeat(10)];
    expect(buildBatches(paragraphs, 100)).toEqual([[0], [1], [2]]);
  });

  it('skips non-translatable paragraphs', () => {
    expect(buildBatches(['***', '  ', 'hello', '1 2 3'], 100)).toEqual([[2]]);
  });
});

describe('parseSegmentedResponse', () => {
  it('maps marker-delimited output back to segments', () => {
    const output = '<<<SEG_1>>>\nHello\n<<<SEG_2>>>\nWorld';
    expect(parseSegmentedResponse(output, 2)).toEqual(['Hello', 'World']);
  });

  it('throws when a segment is missing', () => {
    expect(() => parseSegmentedResponse('<<<SEG_1>>>\nHello', 2)).toThrow(
      /segment 2 of 2 missing/,
    );
  });
});

describe('translateParagraphs', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('translates via the API and preserves array order/length', async () => {
    global.fetch = jest.fn(async () =>
      ollamaResponse('<<<SEG_1>>>\nHello\n<<<SEG_2>>>\nWorld'),
    ) as any;

    const result = await translateParagraphs(['こんにちは', '***', '世界'], {
      maxAttempts: 1,
    });
    expect(result).toEqual(['Hello', '***', 'World']);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('returns the original text when the API fails completely', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as any;

    const paragraphs = ['こんにちは', '世界'];
    const result = await translateParagraphs(paragraphs, {
      maxAttempts: 2,
    });
    expect(result).toEqual(paragraphs);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('retries a malformed response before falling back', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(ollamaResponse('Sure! Here is my translation.'))
      .mockResolvedValueOnce(ollamaResponse('<<<SEG_1>>>\nHello')) as any;

    const result = await translateParagraphs(['こんにちは'], {
      maxAttempts: 2,
    });
    expect(result).toEqual(['Hello']);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('strips Qwen3 <think> blocks from the output', async () => {
    global.fetch = jest.fn(async () =>
      ollamaResponse('<think>reasoning…</think>\n<<<SEG_1>>>\nHello'),
    ) as any;

    expect(await translateParagraphs(['こんにちは'])).toEqual(['Hello']);
  });
});

describe('translateChapterHtml', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('translates text nodes while preserving markup', async () => {
    global.fetch = jest.fn(async () =>
      ollamaResponse('<<<SEG_1>>>\nHello\n<<<SEG_2>>>\nWorld'),
    ) as any;

    const html = '<p class="a">こんにちは</p>\n<p><b>世界</b></p>';
    expect(await translateChapterHtml(html)).toEqual(
      '<p class="a">Hello</p>\n<p><b>World</b></p>',
    );
  });

  it('returns input unchanged when there is nothing to translate', async () => {
    global.fetch = jest.fn() as any;
    expect(await translateChapterHtml('<hr/> *** <br/>')).toEqual(
      '<hr/> *** <br/>',
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
