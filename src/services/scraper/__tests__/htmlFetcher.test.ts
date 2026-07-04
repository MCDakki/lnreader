import { sanitizeHtmlForLlm } from '../htmlFetcher';

jest.mock('@plugins/helpers/fetch', () => ({
  fetchText: jest.fn(),
}));

const PAGE = `
<!DOCTYPE html>
<html>
<head>
  <title>My Novel — Chapter 3: The Storm</title>
  <meta charset="utf-8">
  <style>.chapter { color: red; }</style>
  <script>window.dataLayer = [];</script>
</head>
<body>
  <header class="site-header"><h1>NovelSite</h1></header>
  <nav><ul><li><a href="/">Home</a></li></ul></nav>
  <aside class="sidebar">Popular novels</aside>
  <svg viewBox="0 0 24 24"><path d="M0 0h24"/></svg>
  <script>trackPageview();</script>
  <main>
    <div class="chapter-content" id="content" data-track="body">
      <h2 style="font-weight:bold">Chapter 3: The Storm</h2>
      <p class="p1">The rain hammered the deck.</p>
      <p>“Hold the line!” the captain roared.</p>
      <div class="empty-icon-wrapper"></div>
    </div>
  </main>
  <footer>© NovelSite. <a href="/dmca">DMCA</a></footer>
  <!-- tracking comment -->
</body>
</html>`;

describe('sanitizeHtmlForLlm', () => {
  it('strips scripts, styles, chrome and svg but keeps chapter text', () => {
    const { html, pageTitle } = sanitizeHtmlForLlm(PAGE);

    expect(pageTitle).toBe('My Novel — Chapter 3: The Storm');

    expect(html).toContain('The rain hammered the deck.');
    expect(html).toContain('Hold the line!');
    expect(html).toContain('Chapter 3: The Storm');

    for (const junk of [
      '<script',
      '<style',
      '<nav',
      '<header',
      '<footer',
      '<aside',
      '<svg',
      'trackPageview',
      'dataLayer',
      'NovelSite', // header/footer chrome
      'Popular novels',
    ]) {
      expect(html).not.toContain(junk);
    }
  });

  it('drops all attributes and empty containers', () => {
    const { html } = sanitizeHtmlForLlm(PAGE);
    expect(html).not.toContain('class=');
    expect(html).not.toContain('id=');
    expect(html).not.toContain('style=');
    expect(html).not.toContain('data-track');
    expect(html).not.toContain('empty-icon-wrapper');
    expect(html).not.toContain('<!--');
  });

  it('truncates to maxChars without tearing a tag open', () => {
    const { html } = sanitizeHtmlForLlm(PAGE, 60);
    expect(html.length).toBeLessThanOrEqual(60);
    const lastOpen = html.lastIndexOf('<');
    const lastClose = html.lastIndexOf('>');
    expect(lastOpen).toBeLessThanOrEqual(lastClose);
  });

  it('handles documents without head/title', () => {
    const { html, pageTitle } = sanitizeHtmlForLlm(
      '<p>bare fragment text</p>',
    );
    expect(pageTitle).toBe('');
    expect(html).toContain('bare fragment text');
  });
});
