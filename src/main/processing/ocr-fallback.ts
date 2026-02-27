// ============================================================================
// OCR Fallback — Tesseract-based text extraction for scanned PDFs
// ============================================================================
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

/**
 * Check if Tesseract OCR is available on the system
 */
export async function isTesseractAvailable(): Promise<boolean> {
  try {
    const { stdout } = await execAsync('tesseract --version');
    return stdout.includes('tesseract');
  } catch {
    return false;
  }
}

/**
 * Extract text from a scanned PDF or image using Tesseract OCR.
 *
 * Requires system dependencies:
 * - tesseract-ocr (brew install tesseract / apt install tesseract-ocr)
 * - For PDF input, also needs poppler-utils for pdftoppm
 *
 * @param filePath Path to the PDF or image file
 * @returns Extracted text content
 */
export async function extractTextWithOCR(filePath: string): Promise<string> {
  const available = await isTesseractAvailable();
  if (!available) {
    throw new Error(
      'Tesseract OCR is not installed. ' +
      'Install it with: brew install tesseract (macOS) or apt install tesseract-ocr (Linux). ' +
      'This is needed to read scanned PDF chargemasters.'
    );
  }

  const ext = path.extname(filePath).toLowerCase();
  const tmpDir = path.join(path.dirname(filePath), 'ocr_tmp_' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    let imagePaths: string[] = [];

    if (ext === '.pdf') {
      // Convert PDF pages to images using pdftoppm (from poppler-utils)
      try {
        await execAsync(
          `pdftoppm -png -r 300 "${filePath}" "${path.join(tmpDir, 'page')}"`,
          { timeout: 120000 },
        );
        imagePaths = fs.readdirSync(tmpDir)
          .filter((f) => f.endsWith('.png'))
          .sort()
          .map((f) => path.join(tmpDir, f));
      } catch (err) {
        throw new Error(
          'pdftoppm (poppler-utils) is required for PDF OCR. ' +
          'Install with: brew install poppler (macOS) or apt install poppler-utils (Linux).',
          { cause: err },
        );
      }
    } else {
      // Direct image input
      imagePaths = [filePath];
    }

    if (imagePaths.length === 0) {
      throw new Error('No pages extracted from PDF for OCR processing.');
    }

    // Run Tesseract on each page
    const textParts: string[] = [];
    for (const imagePath of imagePaths) {
      const outputBase = imagePath + '_out';
      await execAsync(
        `tesseract "${imagePath}" "${outputBase}" -l eng --psm 6`,
        { timeout: 60000 },
      );

      const outputFile = outputBase + '.txt';
      if (fs.existsSync(outputFile)) {
        textParts.push(fs.readFileSync(outputFile, 'utf-8'));
        fs.unlinkSync(outputFile);
      }
    }

    return textParts.join('\n');
  } finally {
    // Cleanup temp directory
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch { /* ignore cleanup errors */ }
  }
}

/**
 * Parse OCR-extracted text into structured rows.
 * OCR text is often messy, so we use aggressive pattern matching.
 */
export function parseOCRText(text: string): Record<string, string>[] {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 5);
  const rows: Record<string, string>[] = [];

  for (const line of lines) {
    // Pattern 1: CODE DESCRIPTION $PRICE
    const match1 = line.match(/^(\d{5}|[A-V]\d{4})\s+(.+?)\s+\$?([\d,]+\.?\d*)\s*$/);
    if (match1) {
      rows.push({
        billing_code: match1[1],
        description: match1[2].trim(),
        charge: match1[3].replace(/,/g, ''),
      });
      continue;
    }

    // Pattern 2: Multiple prices on one line (common in chargemasters)
    const match2 = line.match(
      /^(\d{5}|[A-V]\d{4})\s+(.+?)\s+\$?([\d,]+\.?\d*)\s+\$?([\d,]+\.?\d*)/
    );
    if (match2) {
      rows.push({
        billing_code: match2[1],
        description: match2[2].trim(),
        gross_charge: match2[3].replace(/,/g, ''),
        discounted_cash: match2[4].replace(/,/g, ''),
      });
      continue;
    }

    // Pattern 3: Flexible whitespace-separated with amounts
    const parts = line.split(/\s{2,}/);
    if (parts.length >= 3) {
      const code = parts[0].trim();
      const lastVal = parts[parts.length - 1].replace(/[$,]/g, '');
      if (/^\d{3,5}$/.test(code) && !isNaN(parseFloat(lastVal))) {
        rows.push({
          billing_code: code,
          description: parts.slice(1, -1).join(' ').trim(),
          charge: lastVal,
        });
      }
    }
  }

  return rows;
}
