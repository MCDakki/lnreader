import { isLlmScraperEnabled, parsedChapterToHtml } from '../llmScraper';
import {
  getLlamaEngineSettings,
  isLlmEngineAvailable,
} from '@services/llm/llamaEngine';

// Not under test here, and its import chain pulls in native modules.
jest.mock('../htmlFetcher', () => ({ fetchSanitizedChapterHtml: jest.fn() }));

jest.mock('@services/llm/llamaEngine', () => ({
  getLlamaEngineSettings: jest.fn(),
  isLlmEngineAvailable: jest.fn(),
  completeJson: jest.fn(),
}));

const mockSettings = getLlamaEngineSettings as jest.MockedFunction<
  typeof getLlamaEngineSettings
>;
const mockAvailable = isLlmEngineAvailable as jest.MockedFunction<
  typeof isLlmEngineAvailable
>;

const settings = (enabled: boolean) => ({
  enabled,
  modelPath: '/models/test.gguf',
  contextSize: 8192,
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('isLlmScraperEnabled', () => {
  it('is on when the setting is enabled and a model is present', () => {
    mockSettings.mockReturnValue(settings(true));
    mockAvailable.mockReturnValue(true);
    expect(isLlmScraperEnabled()).toBe(true);
  });

  it('is off when the setting is disabled', () => {
    mockSettings.mockReturnValue(settings(false));
    mockAvailable.mockReturnValue(true);
    expect(isLlmScraperEnabled()).toBe(false);
  });

  it('is off when enabled but no model is on device', () => {
    // Otherwise every chapter read fetches and sanitizes the page just
    // to fail at inference, then re-fetches it on the fallback path.
    mockSettings.mockReturnValue(settings(true));
    mockAvailable.mockReturnValue(false);
    expect(isLlmScraperEnabled()).toBe(false);
  });
});

describe('parsedChapterToHtml', () => {
  it('renders title and paragraphs', () => {
    expect(
      parsedChapterToHtml({ title: 'Chapter 1', content: ['a', 'b'] }),
    ).toBe('<h1>Chapter 1</h1>\n<p>a</p>\n<p>b</p>');
  });

  it('omits the heading when the model found no title', () => {
    expect(parsedChapterToHtml({ title: '', content: ['a'] })).toBe('<p>a</p>');
  });

  it('escapes model output so it cannot inject markup', () => {
    expect(
      parsedChapterToHtml({
        title: '<script>x</script>',
        content: ['a & <b>c</b>'],
      }),
    ).toBe(
      '<h1>&lt;script&gt;x&lt;/script&gt;</h1>\n<p>a &amp; &lt;b&gt;c&lt;/b&gt;</p>',
    );
  });
});
