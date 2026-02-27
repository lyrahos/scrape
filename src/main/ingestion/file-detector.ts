// ============================================================================
// Transparency File Detector — Crawls hospital websites to find pricing files
// ============================================================================
import axios, { type AxiosResponse } from 'axios';
import * as cheerio from 'cheerio';
import robotsParser from 'robots-parser';
import { URL } from 'url';
import type { FileType, TransparencyFile } from '../../shared/types';
import {
  COMMON_TRANSPARENCY_PATHS,
  TRANSPARENCY_FILE_PATTERNS,
  SUPPORTED_FILE_EXTENSIONS,
} from '../../shared/constants';
import { generateId } from '../storage/database';

interface DetectedFile {
  url: string;
  fileType: FileType;
  fileSize?: number;
  lastModified?: string;
}

const FILE_EXTENSION_MAP: Record<string, FileType> = {
  '.csv': 'csv', '.json': 'json', '.xml': 'xml',
  '.xls': 'xls', '.xlsx': 'xlsx', '.pdf': 'pdf',
  '.gz': 'gzip', '.gzip': 'gzip',
};

const HTTP_TIMEOUT = 30000;
const USER_AGENT = 'HospitalTransparencyBot/1.0 (CMS Price Transparency Research)';

/**
 * Detects transparency files for a hospital by crawling its website
 */
export async function detectTransparencyFiles(
  hospitalId: string,
  websiteUrl?: string
): Promise<Omit<TransparencyFile, 'discovered_at'>[]> {
  if (!websiteUrl) return [];

  const baseUrl = normalizeUrl(websiteUrl);
  if (!baseUrl) return [];

  // Check robots.txt
  const canCrawl = await checkRobotsTxt(baseUrl);
  if (!canCrawl) return [];

  const detected: DetectedFile[] = [];

  // Strategy 1: Check common transparency paths
  const pathResults = await checkCommonPaths(baseUrl);
  detected.push(...pathResults);

  // Strategy 2: Crawl main page for links
  if (detected.length === 0) {
    const crawlResults = await crawlPageForFiles(baseUrl);
    detected.push(...crawlResults);
  }

  // Strategy 3: Search specific transparency page
  if (detected.length === 0) {
    const searchResults = await searchTransparencyPage(baseUrl);
    detected.push(...searchResults);
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  const unique = detected.filter((d) => {
    if (seen.has(d.url)) return false;
    seen.add(d.url);
    return true;
  });

  return unique.map((d) => ({
    file_id: generateId(),
    hospital_id: hospitalId,
    file_url: d.url,
    file_type: d.fileType,
    file_size: d.fileSize,
    last_modified_header: d.lastModified,
    is_active: true,
    status: 'discovered' as const,
  }));
}

async function checkRobotsTxt(baseUrl: string): Promise<boolean> {
  try {
    const robotsUrl = new URL('/robots.txt', baseUrl).href;
    const resp = await axios.get(robotsUrl, { timeout: 10000, headers: { 'User-Agent': USER_AGENT } });
    const robots = robotsParser(robotsUrl, resp.data);
    return robots.isAllowed(baseUrl, USER_AGENT) !== false;
  } catch {
    return true; // No robots.txt = allow
  }
}

async function checkCommonPaths(baseUrl: string): Promise<DetectedFile[]> {
  const results: DetectedFile[] = [];

  for (const pathSuffix of COMMON_TRANSPARENCY_PATHS) {
    try {
      const url = new URL(pathSuffix, baseUrl).href;
      const resp = await axios.get(url, {
        timeout: HTTP_TIMEOUT,
        headers: { 'User-Agent': USER_AGENT },
        maxRedirects: 5,
        validateStatus: (s) => s < 400,
      });

      // Check if the response itself is a downloadable file
      const contentType = resp.headers['content-type'] ?? '';
      if (isDownloadableContentType(contentType)) {
        results.push({
          url: resp.request?.res?.responseUrl ?? url,
          fileType: contentTypeToFileType(contentType),
          fileSize: parseInt(resp.headers['content-length'] ?? '0', 10) || undefined,
          lastModified: resp.headers['last-modified'],
        });
        continue;
      }

      // Parse HTML page for file links
      if (contentType.includes('text/html')) {
        const pageFiles = extractFileLinks(resp.data, url);
        results.push(...pageFiles);
      }
    } catch {
      // Path doesn't exist, continue
    }
  }

  return results;
}

async function crawlPageForFiles(baseUrl: string): Promise<DetectedFile[]> {
  try {
    const resp = await axios.get(baseUrl, {
      timeout: HTTP_TIMEOUT,
      headers: { 'User-Agent': USER_AGENT },
    });
    return extractFileLinks(resp.data, baseUrl);
  } catch {
    return [];
  }
}

async function searchTransparencyPage(baseUrl: string): Promise<DetectedFile[]> {
  try {
    // Look for sitemap first
    const sitemapUrl = new URL('/sitemap.xml', baseUrl).href;
    const resp = await axios.get(sitemapUrl, {
      timeout: HTTP_TIMEOUT,
      headers: { 'User-Agent': USER_AGENT },
    });

    const $ = cheerio.load(resp.data, { xmlMode: true });
    const urls: string[] = [];
    $('url loc').each((_, el) => {
      const loc = $(el).text();
      if (TRANSPARENCY_FILE_PATTERNS.some((p) => p.test(loc))) {
        urls.push(loc);
      }
    });

    const results: DetectedFile[] = [];
    for (const url of urls.slice(0, 5)) {
      try {
        const pageResp = await axios.get(url, {
          timeout: HTTP_TIMEOUT,
          headers: { 'User-Agent': USER_AGENT },
        });
        results.push(...extractFileLinks(pageResp.data, url));
      } catch {
        // skip
      }
    }
    return results;
  } catch {
    return [];
  }
}

function extractFileLinks(html: string, pageUrl: string): DetectedFile[] {
  const $ = cheerio.load(html);
  const results: DetectedFile[] = [];

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;

    const linkText = $(el).text().toLowerCase();
    const absoluteUrl = resolveUrl(href, pageUrl);
    if (!absoluteUrl) return;

    // Check if link points to a supported file
    const ext = getFileExtension(absoluteUrl);
    if (ext && SUPPORTED_FILE_EXTENSIONS.includes(ext)) {
      results.push({
        url: absoluteUrl,
        fileType: FILE_EXTENSION_MAP[ext] ?? 'unknown',
      });
      return;
    }

    // Check if link text suggests transparency data
    if (TRANSPARENCY_FILE_PATTERNS.some((p) => p.test(linkText) || p.test(href))) {
      results.push({
        url: absoluteUrl,
        fileType: guessFileType(absoluteUrl),
      });
    }
  });

  return results;
}

function normalizeUrl(url: string): string | null {
  try {
    if (!url.startsWith('http')) url = 'https://' + url;
    const parsed = new URL(url);
    return parsed.origin;
  } catch {
    return null;
  }
}

function resolveUrl(href: string, base: string): string | null {
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}

function getFileExtension(url: string): string | null {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/(\.[a-z0-9]+)$/i);
    return match ? match[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

function isDownloadableContentType(ct: string): boolean {
  return /csv|json|xml|excel|spreadsheet|pdf|octet-stream|gzip/.test(ct);
}

function contentTypeToFileType(ct: string): FileType {
  if (ct.includes('csv')) return 'csv';
  if (ct.includes('json')) return 'json';
  if (ct.includes('xml')) return 'xml';
  if (ct.includes('excel') || ct.includes('spreadsheet')) return 'xlsx';
  if (ct.includes('pdf')) return 'pdf';
  if (ct.includes('gzip')) return 'gzip';
  return 'unknown';
}

function guessFileType(url: string): FileType {
  const ext = getFileExtension(url);
  return ext ? (FILE_EXTENSION_MAP[ext] ?? 'unknown') : 'unknown';
}
