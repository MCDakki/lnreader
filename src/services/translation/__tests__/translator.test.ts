import {
  buildBatches,
  parseSegmentedResponse,
  translateParagraphs,
} from '../translator';
import { translateChapterHtml } from '../translateHtml';
import { completeChat } from '../localEngine';

jest.mock('../localEngine', () => ({
  completeChat: jest.fn(),
}));

const mockCompleteChat = completeChat as jest.Mock;

beforeEach(() => {
  mockCompleteChat.mockReset();
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

describe('translateParagraphs (local llama.rn engine)', () => {
  it('translates via the local engine and preserves array order/length', async () => {
    mockCompleteChat.mockResolvedValueOnce(
      '<<<SEG_1>>>\nHello\n<<<SEG_2>>>\nWorld',
    );

    const result = await translateParagraphs(['こんにちは', '***', '世界'], {
      maxAttempts: 1,
    });
    expect(result).toEqual(['Hello', '***', 'World']);
    expect(mockCompleteChat).toHaveBeenCalledTimes(1);
    // Strings are fed straight into the local completion, not HTTP.
    const [messages, options] = mockCompleteChat.mock.calls[0];
    expect(messages[0].role).toBe('system');
    expect(messages[1].content).toContain('こんにちは');
    expect(options.modelUrl).toBeTruthy();
  });

  it('returns the original text when inference fails completely', async () => {
    mockCompleteChat.mockRejectedValue(new Error('context init failed'));

    const paragraphs = ['こんにちは', '世界'];
    const result = await translateParagraphs(paragraphs, {
      maxAttempts: 2,
    });
    expect(result).toEqual(paragraphs);
    expect(mockCompleteChat).toHaveBeenCalledTimes(2);
  });

  it('retries a malformed response before falling back', async () => {
    mockCompleteChat
      .mockResolvedValueOnce('Sure! Here is my translation.')
      .mockResolvedValueOnce('<<<SEG_1>>>\nHello');

    const result = await translateParagraphs(['こんにちは'], {
      maxAttempts: 2,
    });
    expect(result).toEqual(['Hello']);
    expect(mockCompleteChat).toHaveBeenCalledTimes(2);
  });

  it('strips reasoning <think> blocks from the output', async () => {
    mockCompleteChat.mockResolvedValueOnce(
      '<think>reasoning…</think>\n<<<SEG_1>>>\nHello',
    );

    expect(await translateParagraphs(['こんにちは'])).toEqual(['Hello']);
  });
});

describe('translateChapterHtml', () => {
  it('translates text nodes while preserving markup', async () => {
    mockCompleteChat.mockResolvedValueOnce(
      '<<<SEG_1>>>\nHello\n<<<SEG_2>>>\nWorld',
    );

    const html = '<p class="a">こんにちは</p>\n<p><b>世界</b></p>';
    expect(await translateChapterHtml(html)).toEqual(
      '<p class="a">Hello</p>\n<p><b>World</b></p>',
    );
  });

  it('returns input unchanged when there is nothing to translate', async () => {
    expect(await translateChapterHtml('<hr/> *** <br/>')).toEqual(
      '<hr/> *** <br/>',
    );
    expect(mockCompleteChat).not.toHaveBeenCalled();
  });
});
