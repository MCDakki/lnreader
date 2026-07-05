import {
  isTranslatedHtml,
  markTranslatedHtml,
  TRANSLATED_COMMENT,
} from '../translatedMarker';
import { sanitizeChapterText } from '@screens/reader/utils/sanitizeChapterText';

describe('translatedMarker', () => {
  it('round-trips through mark/detect', () => {
    const marked = markTranslatedHtml('<p>Hello</p>');
    expect(isTranslatedHtml(marked)).toBe(true);
    expect(marked).toContain('<p>Hello</p>');
  });

  it('does not flag unmarked chapter HTML', () => {
    expect(isTranslatedHtml('<p>Hello</p>')).toBe(false);
  });

  // The reader pipes persisted chapter HTML through sanitizeChapterText
  // before useChapterTextInterceptor sees it. The marker must survive
  // that pass or batch-translated chapters get re-translated on read.
  it('survives the reader sanitizer', () => {
    const sanitized = sanitizeChapterText(
      'plugin',
      'novel',
      'chapter',
      markTranslatedHtml('<p>Hello</p>'),
    );
    expect(isTranslatedHtml(sanitized)).toBe(true);
    expect(sanitized).toContain('<p>Hello</p>');
  });

  it('a bare HTML comment would NOT survive the sanitizer', () => {
    const sanitized = sanitizeChapterText(
      'plugin',
      'novel',
      'chapter',
      `${TRANSLATED_COMMENT}\n<p>Hello</p>`,
    );
    expect(sanitized).not.toContain(TRANSLATED_COMMENT);
  });
});
