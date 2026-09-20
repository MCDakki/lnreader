import { translateChapter } from '../translateChapterTask';
import { getChapter } from '@database/queries/ChapterQueries';
import { getNovelById } from '@database/queries/NovelQueries';
import { getPlugin } from '@plugins/pluginManager';
import NativeFile from '@specs/NativeFile';
import { ensureChapterHtml } from '@services/download/downloadChapter';
import { translateChapterHtmlLocal } from '@services/translation/localTranslator';
import { TRANSLATED_ATTR } from '@services/translation/translatedMarker';

jest.mock('@database/queries/ChapterQueries', () => ({
  getChapter: jest.fn(),
}));
jest.mock('@database/queries/NovelQueries', () => ({
  getNovelById: jest.fn(),
}));
jest.mock('@plugins/pluginManager', () => ({ getPlugin: jest.fn() }));
jest.mock('@strings/translations', () => ({ getString: jest.fn(() => 'err') }));
jest.mock('@utils/mmkv/mmkv', () => ({ getMMKVObject: jest.fn(() => null) }));
jest.mock('@utils/sleep', () => ({ sleep: jest.fn(() => Promise.resolve()) }));
jest.mock('@utils/Storages', () => ({ NOVEL_STORAGE: '/novels' }));
jest.mock('@specs/NativeFile', () => ({
  __esModule: true,
  default: { exists: jest.fn(), readFile: jest.fn(), writeFile: jest.fn() },
}));
jest.mock('@services/download/downloadChapter', () => ({
  ensureChapterHtml: jest.fn(),
}));
jest.mock('@services/translation/localTranslator', () => ({
  translateChapterHtmlLocal: jest.fn(),
}));

const mockGetChapter = getChapter as jest.MockedFunction<any>;
const mockGetNovel = getNovelById as jest.MockedFunction<any>;
const mockGetPlugin = getPlugin as jest.MockedFunction<any>;
const mockEnsureHtml = ensureChapterHtml as jest.MockedFunction<any>;
const mockTranslate = translateChapterHtmlLocal as jest.MockedFunction<any>;
const mockFile = NativeFile as jest.Mocked<any>;

const task = { chapterId: 7, novelName: 'Novel', chapterName: 'Chapter 7' };
const setMeta = () => {};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetChapter.mockResolvedValue({ id: 7, novelId: 3, path: '/c7' });
  mockGetNovel.mockResolvedValue({ id: 3, pluginId: 'plug' });
  mockGetPlugin.mockReturnValue({ id: 'plug' });
  mockEnsureHtml.mockResolvedValue('<p>original</p>');
  mockFile.exists.mockReturnValue(false);
});

describe('translateChapter', () => {
  it('persists the translation and keeps the original as source.html', async () => {
    mockTranslate.mockResolvedValue({
      html: '<p>translated</p>',
      translatedCount: 4,
      totalCount: 4,
    });

    await translateChapter(task, setMeta);

    const written = Object.fromEntries(
      mockFile.writeFile.mock.calls.map(([path, body]: [string, string]) => [
        path,
        body,
      ]),
    );
    expect(written['/novels/plug/3/7/source.html']).toBe('<p>original</p>');
    expect(written['/novels/plug/3/7/index.html']).toContain(
      '<p>translated</p>',
    );
    expect(written['/novels/plug/3/7/index.html']).toContain(TRANSLATED_ATTR);
  });

  it('skips a chapter that already carries the translated marker', async () => {
    mockFile.exists.mockReturnValue(true);
    mockFile.readFile.mockReturnValue(`<div ${TRANSLATED_ATTR}="true"></div>`);

    await translateChapter(task, setMeta);

    expect(mockTranslate).not.toHaveBeenCalled();
    expect(mockFile.writeFile).not.toHaveBeenCalled();
  });

  it('writes nothing when only some segments translated', async () => {
    // A partial result must not be persisted: the marker would freeze
    // the untranslated batches, since both this task and the reader's
    // Auto-Translate skip marked HTML.
    mockTranslate.mockResolvedValue({
      html: '<p>half</p>',
      translatedCount: 2,
      totalCount: 5,
    });

    await translateChapter(task, setMeta);

    expect(mockFile.writeFile).not.toHaveBeenCalled();
  });

  it('writes nothing when the chapter has no translatable text', async () => {
    mockTranslate.mockResolvedValue({
      html: '',
      translatedCount: 0,
      totalCount: 0,
    });

    await translateChapter(task, setMeta);

    expect(mockFile.writeFile).not.toHaveBeenCalled();
  });

  it('retries once before giving up, leaving the original untouched', async () => {
    mockTranslate.mockRejectedValue(new Error('engine died'));

    await translateChapter(task, setMeta);

    expect(mockTranslate).toHaveBeenCalledTimes(2);
    expect(mockFile.writeFile).not.toHaveBeenCalled();
  });
});
