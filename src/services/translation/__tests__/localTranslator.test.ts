import {
  translateParagraphsLocal,
  translateChapterHtmlLocal,
  translationBatchChars,
  translationMaxTokens,
} from '../localTranslator';
import { completeText, getLlamaEngineSettings } from '@services/llm/llamaEngine';

jest.mock('@services/llm/llamaEngine', () => ({
  completeText: jest.fn(),
  getLlamaEngineSettings: jest.fn(() => ({
    enabled: true,
    modelPath: '/models/test.gguf',
    contextSize: 8192,
  })),
}));

const mockCompleteText = completeText as jest.MockedFunction<
  typeof completeText
>;

const segmented = (...texts: string[]) =>
  texts.map((text, i) => `<<<SEG_${i + 1}>>>\n${text}`).join('\n');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('context budget helpers', () => {
  it('splits the context window between prompt and completion', () => {
    expect(translationBatchChars(8192)).toBe(7680);
    expect(translationMaxTokens(8192)).toBe(3840);
    expect(translationBatchChars(4096)).toBe(3584);
    expect(translationMaxTokens(4096)).toBe(1792);
  });

  it('never drops the char budget below the floor', () => {
    expect(translationBatchChars(1024)).toBe(1500);
  });
});

describe('translateParagraphsLocal', () => {
  it('translates paragraphs and preserves array order/length', async () => {
    mockCompleteText.mockResolvedValueOnce(segmented('Hello', 'World'));

    const result = await translateParagraphsLocal(
      ['こんにちは', '***', '世界'],
      'English',
    );
    expect(result.paragraphs).toEqual(['Hello', '***', 'World']);
    expect(result.translatedCount).toBe(2);
    expect(result.totalCount).toBe(2);
    expect(mockCompleteText).toHaveBeenCalledTimes(1);
  });

  it('sends the segment-marker payload and target language', async () => {
    mockCompleteText.mockResolvedValueOnce(segmented('Bonjour'));

    await translateParagraphsLocal(['Hello'], 'French');

    const [messages] = mockCompleteText.mock.calls[0];
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('French');
    expect(messages[1].content).toBe('<<<SEG_1>>>\nHello');
  });

  it('retries a malformed response, then keeps originals', async () => {
    mockCompleteText
      .mockResolvedValueOnce('<<<SEG_1>>>\nOnly one') // missing SEG_2
      .mockResolvedValueOnce('nothing useful');

    const result = await translateParagraphsLocal(['abc', 'def'], 'English');
    expect(result.paragraphs).toEqual(['abc', 'def']);
    expect(result.translatedCount).toBe(0);
    expect(result.totalCount).toBe(2);
    expect(mockCompleteText).toHaveBeenCalledTimes(2);
  }, 15000);

  it('keeps successful batches when a later batch fails', async () => {
    // Force two batches with a tiny context: floor is 1500 chars.
    (getLlamaEngineSettings as jest.Mock).mockReturnValueOnce({
      enabled: true,
      modelPath: '/models/test.gguf',
      contextSize: 1024,
    });
    const long = 'x'.repeat(1490); // fills the 1500-char batch on its own
    mockCompleteText
      .mockResolvedValueOnce(segmented('FIRST'))
      .mockRejectedValueOnce(new Error('boom'))
      .mockRejectedValueOnce(new Error('boom'));

    const result = await translateParagraphsLocal(
      [long, 'second paragraph'],
      'English',
    );
    expect(result.paragraphs[0]).toBe('FIRST');
    expect(result.paragraphs[1]).toBe('second paragraph');
    expect(result.translatedCount).toBe(1);
    expect(result.totalCount).toBe(2);
  }, 15000);

  it('strips <think> blocks before parsing', async () => {
    mockCompleteText.mockResolvedValueOnce(
      `<think>reasoning…</think>${segmented('Clean')}`,
    );

    const result = await translateParagraphsLocal(['раз'], 'English');
    expect(result.paragraphs).toEqual(['Clean']);
  });

  it('reports batch progress', async () => {
    mockCompleteText.mockResolvedValueOnce(segmented('One', 'Two'));
    const onProgress = jest.fn();

    await translateParagraphsLocal(['one', 'two'], 'English', onProgress);
    expect(onProgress).toHaveBeenCalledWith(1, 1);
  });

  it('propagates engine-level failures (no model on device)', async () => {
    const engineError = new Error('No GGUF model found');
    engineError.name = 'LlamaEngineError';
    mockCompleteText.mockRejectedValueOnce(engineError);

    await expect(
      translateParagraphsLocal(['text'], 'English'),
    ).rejects.toThrow('No GGUF model found');
  });
});

describe('translateChapterHtmlLocal', () => {
  it('translates text nodes while preserving markup', async () => {
    mockCompleteText.mockResolvedValueOnce(segmented('Hello', 'World'));

    const result = await translateChapterHtmlLocal(
      '<h1>こんにちは</h1><p>世界</p>',
      'English',
    );
    expect(result.html).toBe('<h1>Hello</h1><p>World</p>');
    expect(result.translatedCount).toBe(2);
    expect(result.totalCount).toBe(2);
  });

  it('returns the input unchanged when there is nothing to translate', async () => {
    const html = '<p>***</p><hr/>';
    const result = await translateChapterHtmlLocal(html, 'English');
    expect(result.html).toBe(html);
    expect(result.translatedCount).toBe(0);
    expect(result.totalCount).toBe(0);
    expect(mockCompleteText).not.toHaveBeenCalled();
  });
});
