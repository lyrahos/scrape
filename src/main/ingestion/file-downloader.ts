// ============================================================================
// File Downloader — Async download with queue, retry, and rate limiting
// ============================================================================
import axios from 'axios';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { FileRepo } from '../storage/repositories';

const USER_AGENT = 'HospitalTransparencyBot/1.0 (CMS Price Transparency Research)';
const DOWNLOAD_TIMEOUT = 300000; // 5 minutes
const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB

export interface DownloadResult {
  success: boolean;
  localPath?: string;
  hash?: string;
  size?: number;
  lastModified?: string;
  error?: string;
}

interface DownloadQueueItem {
  fileId: string;
  url: string;
  hospitalId: string;
  resolve: (result: DownloadResult) => void;
  reject: (error: Error) => void;
}

class DownloadManager {
  private queue: DownloadQueueItem[] = [];
  private activeCount = 0;
  private maxConcurrency = 5;
  private delayMs = 1000;
  private downloadDir: string;

  constructor() {
    const userDataPath = app?.getPath('userData') ?? process.cwd();
    this.downloadDir = path.join(userDataPath, 'downloads');
    if (!fs.existsSync(this.downloadDir)) {
      fs.mkdirSync(this.downloadDir, { recursive: true });
    }
  }

  setConcurrency(n: number): void {
    this.maxConcurrency = Math.max(1, Math.min(20, n));
  }

  setDelay(ms: number): void {
    this.delayMs = Math.max(0, ms);
  }

  async download(fileId: string, url: string, hospitalId: string): Promise<DownloadResult> {
    return new Promise((resolve, reject) => {
      this.queue.push({ fileId, url, hospitalId, resolve, reject });
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.activeCount >= this.maxConcurrency || this.queue.length === 0) return;

    const item = this.queue.shift()!;
    this.activeCount++;

    try {
      const result = await this.executeDownload(item);
      item.resolve(result);
    } catch (err) {
      item.resolve({
        success: false,
        error: err instanceof Error ? err.message : 'Unknown download error',
      });
    } finally {
      this.activeCount--;
      if (this.delayMs > 0) {
        await new Promise((r) => setTimeout(r, this.delayMs));
      }
      this.processQueue();
    }
  }

  private async executeDownload(item: DownloadQueueItem): Promise<DownloadResult> {
    FileRepo.updateStatus(item.fileId, 'downloading');

    let lastError: string | undefined;
    const maxRetries = 3;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Head request to check size
        const headResp = await axios.head(item.url, {
          timeout: 15000,
          headers: { 'User-Agent': USER_AGENT },
          validateStatus: (s) => s < 400,
        });

        const contentLength = parseInt(headResp.headers['content-length'] ?? '0', 10);
        if (contentLength > MAX_FILE_SIZE) {
          return { success: false, error: `File too large: ${contentLength} bytes` };
        }

        // Download
        const localPath = path.join(
          this.downloadDir,
          `${item.hospitalId}_${item.fileId}${this.getExtFromUrl(item.url)}`
        );

        const response = await axios.get(item.url, {
          timeout: DOWNLOAD_TIMEOUT,
          responseType: 'arraybuffer',
          headers: { 'User-Agent': USER_AGENT },
          maxRedirects: 5,
          maxContentLength: MAX_FILE_SIZE,
        });

        const buffer = Buffer.from(response.data);
        fs.writeFileSync(localPath, buffer);

        const hash = crypto.createHash('sha256').update(buffer).digest('hex');
        const size = buffer.length;
        const lastModified = response.headers['last-modified'];

        FileRepo.updateHash(item.fileId, hash, size);
        FileRepo.updateStatus(item.fileId, 'downloaded');

        return { success: true, localPath, hash, size, lastModified };
      } catch (err) {
        lastError = err instanceof Error ? err.message : 'Download failed';
        if (attempt < maxRetries) {
          const backoff = Math.pow(2, attempt + 1) * 1000;
          await new Promise((r) => setTimeout(r, backoff));
        }
      }
    }

    FileRepo.updateStatus(item.fileId, 'error', lastError);
    return { success: false, error: lastError };
  }

  private getExtFromUrl(url: string): string {
    try {
      const pathname = new URL(url).pathname;
      const match = pathname.match(/(\.[a-z0-9]+)$/i);
      return match ? match[1] : '.bin';
    } catch {
      return '.bin';
    }
  }

  getQueueSize(): number {
    return this.queue.length;
  }

  getActiveCount(): number {
    return this.activeCount;
  }
}

export const downloadManager = new DownloadManager();
