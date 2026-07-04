import { parseModelJson, parseChapterWithLlm } from '../llmChapterParser';
import { completeJson } from '@services/llm/llamaEngine';

jest.mock('@services/llm/llamaEngine', () => ({
  completeJson: jest.fn(),
  getLlamaEngineSettings: jest.fn(() => ({
    enabled: true,
    modelPath: '',
    contextSize: 8192,
  })),
}));

const completeJsonMock = completeJson as jest.Mock;

beforeEach(() => {
  completeJsonMock.mockReset();
});

const VALID = JSON.stringify({
  title: 'Chapter 3: The Storm',
  content: ['The rain hammered the deck.', '“Hold the line!”'],
});

describe('parseModelJson', () => {
  it('parses a clean JSON object', () => {
    expect(parseModelJson(VALID)).toEqual({
      title: 'Chapter 3: The Storm',
      content: ['The rain hammered the deck.', '“Hold the line!”'],
    });
  });

  it('survives code fences, think blocks and surrounding prose', () => {
    const noisy = `<think>Let me find the chapter body...</think>
Sure! Here is the JSON you asked for:
\`\`\`json
${VALID}
\`\`\`
Let me know if you need anything else.`;
    expect(parseModelJson(noisy)).toEqual({
      title: 'Chapter 3: The Storm',
      content: ['The rain hammered the deck.', '“Hold the line!”'],
    });
  });

  it('returns null for malformed JSON instead of throwing', () => {
    expect(parseModelJson('{"title": "x", "content": ["a",')).toBeNull();
    expect(parseModelJson('total hallucination, no braces')).toBeNull();
    expect(parseModelJson('')).toBeNull();
  });

  it('rejects wrong shapes', () => {
    expect(parseModelJson('{"title": "x"}')).toBeNull();
    expect(parseModelJson('{"title": "x", "content": "not-array"}')).toBeNull();
    expect(parseModelJson('{"title": "x", "content": []}')).toBeNull();
    expect(parseModelJson('[1,2,3]')).toBeNull();
  });

  it('filters non-string and blank paragraphs, defaults missing title', () => {
    const parsed = parseModelJson(
      '{"content": ["  first  ", 42, null, "", "second"]}',
    );
    expect(parsed).toEqual({ title: '', content: ['first', 'second'] });
  });
});

describe('parseChapterWithLlm', () => {
  it('returns the parsed chapter on first valid completion', async () => {
    completeJsonMock.mockResolvedValueOnce(VALID);
    await expect(parseChapterWithLlm('<p>html</p>', 'page')).resolves.toEqual({
      title: 'Chapter 3: The Storm',
      content: ['The rain hammered the deck.', '“Hold the line!”'],
    });
    expect(completeJsonMock).toHaveBeenCalledTimes(1);
  });

  it('retries once after malformed output, then succeeds', async () => {
    completeJsonMock
      .mockResolvedValueOnce('{"broken":')
      .mockResolvedValueOnce(VALID);
    await expect(
      parseChapterWithLlm('<p>html</p>', 'page'),
    ).resolves.toMatchObject({ title: 'Chapter 3: The Storm' });
    expect(completeJsonMock).toHaveBeenCalledTimes(2);
  });

  it('throws after two malformed completions', async () => {
    completeJsonMock.mockResolvedValue('nonsense');
    await expect(parseChapterWithLlm('<p>html</p>', 'page')).rejects.toThrow(
      'LLM chapter parsing failed',
    );
    expect(completeJsonMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry engine-level failures (missing model, OOM)', async () => {
    completeJsonMock.mockRejectedValue(new Error('No GGUF model found'));
    await expect(parseChapterWithLlm('<p>html</p>', 'page')).rejects.toThrow(
      'No GGUF model found',
    );
    expect(completeJsonMock).toHaveBeenCalledTimes(1);
  });
});
