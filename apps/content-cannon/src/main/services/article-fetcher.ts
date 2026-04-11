import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import log from 'electron-log';

export interface FetchedArticle {
  url: string;
  title: string;
  content: string;
  excerpt: string;
  byline: string | null;
  siteName: string | null;
  success: boolean;
  error?: string;
}

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export async function fetchArticle(url: string): Promise<FetchedArticle> {
  try {
    log.info(`Fetching article: ${url}`);

    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000), // 15 second timeout
    });

    if (!response.ok) {
      return {
        url,
        title: '',
        content: '',
        excerpt: '',
        byline: null,
        siteName: null,
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      return {
        url,
        title: '',
        content: '',
        excerpt: '',
        byline: null,
        siteName: null,
        success: false,
        error: `Not an HTML page: ${contentType}`,
      };
    }

    const html = await response.text();
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article || !article.textContent || article.textContent.trim().length < 200) {
      return {
        url,
        title: dom.window.document.title || '',
        content: '',
        excerpt: '',
        byline: null,
        siteName: null,
        success: false,
        error: 'Could not extract article content (paywall or non-article page)',
      };
    }

    log.info(`Fetched article: "${article.title}" (${article.textContent.length} chars)`);

    return {
      url,
      title: article.title || '',
      content: article.textContent,
      excerpt: article.excerpt || '',
      byline: article.byline || null,
      siteName: article.siteName || null,
      success: true,
    };
  } catch (error: any) {
    log.error(`Failed to fetch ${url}:`, error.message);
    return {
      url,
      title: '',
      content: '',
      excerpt: '',
      byline: null,
      siteName: null,
      success: false,
      error: error.message || 'Unknown fetch error',
    };
  }
}

export async function fetchArticlesBatch(
  urls: string[],
  concurrency: number = 5,
  onProgress?: (fetched: number, total: number) => void
): Promise<FetchedArticle[]> {
  const results: FetchedArticle[] = [];
  let completed = 0;

  // Process in batches for controlled concurrency
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(url => fetchArticle(url)));
    results.push(...batchResults);
    completed += batch.length;
    onProgress?.(completed, urls.length);
  }

  return results;
}
