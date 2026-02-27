// ============================================================================
// Update Engine — Change detection, diffing, re-discovery, scheduling
// ============================================================================
import crypto from 'crypto';
import axios from 'axios';
import fs from 'fs';
import { HospitalRepo, FileRepo, PricingRepo, UpdateLogRepo } from '../storage/repositories';
import { downloadManager, type DownloadResult } from '../ingestion/file-downloader';
import { detectTransparencyFiles } from '../ingestion/file-detector';
import { normalizeFile } from '../processing/normalizer';
import { deduplicateRecords, normalizeDescriptions, diffRecords } from '../processing/deduplicator';
import type { Hospital, TransparencyFile, UpdateResult } from '../../shared/types';

const USER_AGENT = 'HospitalTransparencyBot/1.0';

export interface UpdateProgress {
  hospitalId: string;
  hospitalName: string;
  phase: 'checking' | 'downloading' | 'processing' | 'complete' | 'error';
  message: string;
  current: number;
  total: number;
}

type ProgressCallback = (progress: UpdateProgress) => void;

/**
 * Run update cycle for all stale hospitals
 */
export async function runUpdateCycle(
  daysSinceUpdate = 30,
  onProgress?: ProgressCallback,
): Promise<{ updated: number; errors: number; skipped: number }> {
  const staleHospitals = HospitalRepo.getStaleHospitals(daysSinceUpdate);
  let updated = 0;
  let errors = 0;
  let skipped = 0;

  for (let i = 0; i < staleHospitals.length; i++) {
    const hospital = staleHospitals[i];
    onProgress?.({
      hospitalId: hospital.hospital_id,
      hospitalName: hospital.name,
      phase: 'checking',
      message: `Checking ${hospital.name}`,
      current: i + 1,
      total: staleHospitals.length,
    });

    try {
      const result = await updateHospital(hospital, onProgress);
      if (result === 'success') updated++;
      else if (result === 'no_change') skipped++;
      else errors++;
    } catch (err) {
      errors++;
      UpdateLogRepo.insert({
        hospital_id: hospital.hospital_id,
        update_attempted_at: new Date().toISOString(),
        result: 'error',
        rows_added: 0,
        rows_changed: 0,
        rows_removed: 0,
        error_message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  return { updated, errors, skipped };
}

/**
 * Update a single hospital
 */
export async function updateHospital(
  hospital: Hospital,
  onProgress?: ProgressCallback,
): Promise<UpdateResult> {
  const startTime = Date.now();
  const files = FileRepo.getByHospital(hospital.hospital_id);

  if (files.length === 0) {
    // No files — attempt discovery
    onProgress?.({
      hospitalId: hospital.hospital_id,
      hospitalName: hospital.name,
      phase: 'checking',
      message: 'No files found, attempting discovery...',
      current: 0,
      total: 0,
    });

    const discovered = await detectTransparencyFiles(hospital.hospital_id, hospital.website_url);
    if (discovered.length === 0) {
      UpdateLogRepo.insert({
        hospital_id: hospital.hospital_id,
        update_attempted_at: new Date().toISOString(),
        result: 'file_missing',
        rows_added: 0, rows_changed: 0, rows_removed: 0,
        duration_ms: Date.now() - startTime,
      });
      return 'file_missing';
    }

    for (const file of discovered) {
      FileRepo.upsert(file);
    }
    return updateHospitalFiles(hospital, discovered as TransparencyFile[], startTime, onProgress);
  }

  // Check each file for changes
  return updateHospitalFiles(hospital, files, startTime, onProgress);
}

async function updateHospitalFiles(
  hospital: Hospital,
  files: TransparencyFile[],
  startTime: number,
  onProgress?: ProgressCallback,
): Promise<UpdateResult> {
  let totalAdded = 0;
  let totalChanged = 0;
  let totalRemoved = 0;
  let anyUpdate = false;

  for (const file of files) {
    // Check if file URL still works
    const fileCheck = await checkFileUrl(file.file_url);

    if (!fileCheck.exists) {
      // Link is dead — attempt rediscovery
      onProgress?.({
        hospitalId: hospital.hospital_id,
        hospitalName: hospital.name,
        phase: 'checking',
        message: `File URL dead, attempting rediscovery...`,
        current: 0, total: 0,
      });

      FileRepo.updateStatus(file.file_id, 'stale');

      const rediscovered = await detectTransparencyFiles(hospital.hospital_id, hospital.website_url);
      for (const r of rediscovered) {
        FileRepo.upsert(r);
      }

      UpdateLogRepo.insert({
        hospital_id: hospital.hospital_id,
        file_id: file.file_id,
        update_attempted_at: new Date().toISOString(),
        result: 'rediscovery',
        rows_added: 0, rows_changed: 0, rows_removed: 0,
        duration_ms: Date.now() - startTime,
      });
      continue;
    }

    // Compare hash
    const newHash = fileCheck.hash;
    const oldHash = file.file_hash;

    if (newHash && oldHash && newHash === oldHash) {
      // File unchanged
      FileRepo.updateStatus(file.file_id, 'processed');
      continue;
    }

    // File changed — download and process
    onProgress?.({
      hospitalId: hospital.hospital_id,
      hospitalName: hospital.name,
      phase: 'downloading',
      message: `Downloading updated file...`,
      current: 0, total: 0,
    });

    const download = await downloadManager.download(file.file_id, file.file_url, hospital.hospital_id);
    if (!download.success || !download.localPath) {
      FileRepo.updateStatus(file.file_id, 'error', download.error);
      continue;
    }

    onProgress?.({
      hospitalId: hospital.hospital_id,
      hospitalName: hospital.name,
      phase: 'processing',
      message: `Processing updated data...`,
      current: 0, total: 0,
    });

    // Normalize
    const result = normalizeFile(download.localPath, file.file_type, hospital.hospital_id, file.file_id);
    let records = deduplicateRecords(result.records);
    records = normalizeDescriptions(records);

    // Get old records for diffing
    const oldRecords = PricingRepo.getByHospital(hospital.hospital_id, 100000);
    const diff = diffRecords(oldRecords, records);

    // Upsert new data
    const upsertResult = PricingRepo.upsertCurrent(records);

    totalAdded += upsertResult.added;
    totalChanged += upsertResult.changed;
    anyUpdate = true;

    FileRepo.updateStatus(file.file_id, 'processed');

    // Clean up downloaded file
    try { fs.unlinkSync(download.localPath); } catch { /* ignore */ }
  }

  const result: UpdateResult = anyUpdate ? 'success' : 'no_change';

  UpdateLogRepo.insert({
    hospital_id: hospital.hospital_id,
    update_attempted_at: new Date().toISOString(),
    result,
    rows_added: totalAdded,
    rows_changed: totalChanged,
    rows_removed: totalRemoved,
    duration_ms: Date.now() - startTime,
  });

  onProgress?.({
    hospitalId: hospital.hospital_id,
    hospitalName: hospital.name,
    phase: 'complete',
    message: `Done. Added: ${totalAdded}, Changed: ${totalChanged}`,
    current: 1, total: 1,
  });

  return result;
}

async function checkFileUrl(url: string): Promise<{ exists: boolean; hash?: string }> {
  try {
    const resp = await axios.head(url, {
      timeout: 15000,
      headers: { 'User-Agent': USER_AGENT },
      validateStatus: (s) => s < 500,
    });

    if (resp.status >= 400) {
      return { exists: false };
    }

    // Try ETag or generate hash from content-length + last-modified
    const etag = resp.headers['etag'];
    const lastModified = resp.headers['last-modified'];
    const contentLength = resp.headers['content-length'];

    let hash: string | undefined;
    if (etag) {
      hash = crypto.createHash('md5').update(etag).digest('hex');
    } else if (lastModified && contentLength) {
      hash = crypto.createHash('md5').update(`${lastModified}|${contentLength}`).digest('hex');
    }

    return { exists: true, hash };
  } catch {
    return { exists: false };
  }
}
