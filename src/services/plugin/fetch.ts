import { getPlugin } from '@plugins/pluginManager';
import { isUrlAbsolute } from '@plugins/helpers/isAbsoluteUrl';
import {
  fetchChapterViaLlm,
  isLlmScraperEnabled,
} from '@services/scraper/llmScraper';

export const fetchNovel = async (pluginId: string, novelPath: string) => {
  const plugin = getPlugin(pluginId);
  if (!plugin) {
    throw new Error(`Unknown plugin: ${pluginId}`);
  }
  const res = await plugin.parseNovel(novelPath);
  return res;
};

/**
 * @deprecated Legacy extension path: per-site CSS selectors inside the
 * plugin's `parseChapter`. Breaks whenever a source site changes its
 * markup. Kept only as the fallback for `fetchChapter` while the LLM
 * scraper needs a model file on device; scheduled for removal.
 */
const fetchChapterWithPlugin = async (
  pluginId: string,
  chapterPath: string,
) => {
  const plugin = getPlugin(pluginId);
  let chapterText = `Unknown plugin: ${pluginId}`;
  if (plugin) {
    chapterText = await plugin.parseChapter(chapterPath);
  }
  return chapterText;
};

/**
 * Fetch a chapter's HTML. Primary path is the auto-healing LLM
 * scraper (universal fetch + local llama.rn extraction); the
 * deprecated selector-based plugin extraction only runs when the
 * scraper is disabled or fails (e.g. no GGUF model on device yet).
 */
export const fetchChapter = async (pluginId: string, chapterPath: string) => {
  if (isLlmScraperEnabled()) {
    try {
      return await fetchChapterViaLlm(resolveUrl(pluginId, chapterPath));
    } catch {
      // fall through to the deprecated selector path — a stale
      // extraction attempt still beats an error screen
    }
  }
  return fetchChapterWithPlugin(pluginId, chapterPath);
};

export const fetchChapters = async (pluginId: string, novelPath: string) => {
  const plugin = getPlugin(pluginId);
  if (!plugin) {
    throw new Error(`Unknown plugin: ${pluginId}`);
  }
  const res = await plugin.parseNovel(novelPath);
  return res?.chapters;
};

export const fetchPage = async (
  pluginId: string,
  novelPath: string,
  page: string,
) => {
  const plugin = getPlugin(pluginId);

  if (!plugin) {
    throw new Error(`Unknown plugin: ${pluginId}`);
  }

  if (!plugin.parsePage) {
    throw new Error(`Could not fetch chapters for page ${page}`);
  }
  const res = await plugin.parsePage(novelPath, page);
  return res;
};

export const resolveUrl = (
  pluginId: string,
  path: string,
  isNovel?: boolean,
) => {
  if (isUrlAbsolute(path)) {
    return path;
  }
  const plugin = getPlugin(pluginId);
  try {
    if (!plugin) {
      throw new Error(`Unknown plugin: ${pluginId}`);
    }
    if (plugin.resolveUrl) {
      return plugin.resolveUrl(path, isNovel);
    }
  } catch {
    return path;
  }
  return plugin.site + path;
};
