/**
 * Vanilla JS injected into the hidden fallback WebView via
 * `injectedJavaScript`. Extracts the meaningful paragraph text of a
 * chapter page and posts it back to the React Native thread.
 *
 * Message contract (JSON via window.ReactNativeWebView.postMessage):
 *   { type: 'LNREADER_SCRAPED_CHAPTER', ok: true,  paragraphs: string[], title, url }
 *   { type: 'LNREADER_SCRAPED_CHAPTER', ok: false, error: string, url }
 */
export const SCRAPED_CHAPTER_MESSAGE = 'LNREADER_SCRAPED_CHAPTER';

export const WEBVIEW_SCRAPER_JS = `
(function () {
  if (window.__lnreaderScraperActive) { return; }
  window.__lnreaderScraperActive = true;

  var SETTLE_MS = 1200;      // quiet period after the last DOM mutation
  var MAX_WAIT_MS = 25000;   // hard deadline (Cloudflare, lazy hydration)
  var MIN_CONTENT_CHARS = 400;
  var MIN_PARAGRAPH_CHARS = 2;

  var EXCLUDE_SELECTOR = 'nav,header,footer,aside,script,style,noscript,' +
    'iframe,form,button,select,option,input,textarea,svg,figcaption,' +
    '[role="navigation"],[role="banner"],[role="contentinfo"],' +
    '[role="complementary"],[aria-hidden="true"]';
  var JUNK_NAME = /(^|[\\s_-])(nav|menu|header|footer|sidebar|breadcrumbs?|comments?|share|social|related|recommended?|widget|banner|advert|ads?|sponsor|pagination|paging|toolbar|btn|button|login|signup|modal|popup|rating|tags?|meta)([\\s_-]|$)/i;

  function post(payload) {
    payload.type = '${SCRAPED_CHAPTER_MESSAGE}';
    payload.url = String(location.href);
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(JSON.stringify(payload));
    }
  }

  function attrClass(el) {
    return ((el.id || '') + ' ' + (el.getAttribute && el.getAttribute('class') || ''));
  }

  function isJunk(el) {
    var probe = el;
    for (var depth = 0; probe && probe !== document.body && depth < 8; depth++) {
      if (probe.matches && probe.matches(EXCLUDE_SELECTOR)) { return true; }
      if (JUNK_NAME.test(attrClass(probe))) { return true; }
      probe = probe.parentElement;
    }
    return false;
  }

  function cleanText(node) {
    return (node.innerText || node.textContent || '')
      .replace(/\\u00a0/g, ' ')
      .replace(/[ \\t]+/g, ' ')
      .trim();
  }

  // Score every parent of a <p> by the total characters of its direct
  // <p> children — the chapter body is the densest such container.
  function findBestContainer() {
    var paragraphNodes = document.body.getElementsByTagName('p');
    var best = null;
    var bestScore = 0;
    var scores = new Map();
    for (var i = 0; i < paragraphNodes.length; i++) {
      var p = paragraphNodes[i];
      var text = cleanText(p);
      if (text.length < MIN_PARAGRAPH_CHARS || isJunk(p)) { continue; }
      var parent = p.parentElement;
      if (!parent) { continue; }
      var score = (scores.get(parent) || 0) + text.length;
      scores.set(parent, score);
      if (score > bestScore) { bestScore = score; best = parent; }
    }
    return { container: best, score: bestScore };
  }

  function extractFromContainer(container) {
    var seen = new Set();
    var out = [];
    var nodes = container.querySelectorAll('p,h1,h2,h3,h4,h5,h6,blockquote,li,pre');
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (isJunk(node)) { continue; }
      // Skip wrappers whose text is already covered by a nested match.
      if (node.querySelector && node.querySelector('p')) { continue; }
      var text = cleanText(node);
      if (text.length < MIN_PARAGRAPH_CHARS || seen.has(text)) { continue; }
      seen.add(text);
      out.push(text);
    }
    return out;
  }

  // Sites that render chapters as text + <br> inside a single element.
  function extractFromDenseBlock() {
    var candidates = document.body.querySelectorAll('article,main,section,div');
    var best = null;
    var bestLength = 0;
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      if (isJunk(el) || el.querySelector('p,article,main,section,div')) { continue; }
      var length = cleanText(el).length;
      if (length > bestLength) { bestLength = length; best = el; }
    }
    if (!best || bestLength < MIN_CONTENT_CHARS) { return []; }
    return cleanText(best)
      .split(/\\n+/)
      .map(function (line) { return line.trim(); })
      .filter(function (line) { return line.length >= MIN_PARAGRAPH_CHARS; });
  }

  function attempt() {
    try {
      var found = findBestContainer();
      var paragraphs = found.container ? extractFromContainer(found.container) : [];
      if (paragraphs.join('').length < MIN_CONTENT_CHARS) {
        var dense = extractFromDenseBlock();
        if (dense.join('').length > paragraphs.join('').length) {
          paragraphs = dense;
        }
      }
      return paragraphs;
    } catch (e) {
      return [];
    }
  }

  var startedAt = Date.now();
  var finished = false;
  var settleTimer = null;

  function finish(paragraphs) {
    if (finished) { return; }
    finished = true;
    if (observer) { observer.disconnect(); }
    if (paragraphs.length && paragraphs.join('').length >= MIN_CONTENT_CHARS) {
      post({ ok: true, paragraphs: paragraphs, title: document.title || '' });
    } else if (paragraphs.length) {
      // Short but non-empty (author notes only?) — still better than nothing.
      post({ ok: true, paragraphs: paragraphs, title: document.title || '' });
    } else {
      post({ ok: false, error: 'No readable content found on page' });
    }
  }

  function onSettled() {
    if (finished) { return; }
    var paragraphs = attempt();
    if (paragraphs.join('').length >= MIN_CONTENT_CHARS) {
      finish(paragraphs);
    } else if (Date.now() - startedAt >= MAX_WAIT_MS) {
      finish(paragraphs);
    }
    // else: content not ready (anti-bot check, hydration) — the
    // MutationObserver re-arms the settle timer as the page changes.
  }

  function armSettleTimer() {
    if (settleTimer) { clearTimeout(settleTimer); }
    settleTimer = setTimeout(onSettled, SETTLE_MS);
  }

  var observer = null;
  try {
    observer = new MutationObserver(armSettleTimer);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  } catch (e) { /* observation is best-effort */ }

  setTimeout(function () {
    if (!finished) { finish(attempt()); }
  }, MAX_WAIT_MS + SETTLE_MS);

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    armSettleTimer();
  } else {
    window.addEventListener('DOMContentLoaded', armSettleTimer);
    window.addEventListener('load', armSettleTimer);
  }
})();
true;
`;
