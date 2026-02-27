// ============================================================================
// Electron Main Process
// ============================================================================
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { initializeDatabase, closeDatabase } from '../src/main/storage/database';
import { HospitalRepo, FileRepo, PricingRepo, AnalyticsRepo, UpdateLogRepo } from '../src/main/storage/repositories';
import { discoverHospitalsFromCMS } from '../src/main/ingestion/hospital-discovery';
import { detectTransparencyFiles } from '../src/main/ingestion/file-detector';
import { downloadManager } from '../src/main/ingestion/file-downloader';
import { normalizeFile } from '../src/main/processing/normalizer';
import { deduplicateRecords, normalizeDescriptions } from '../src/main/processing/deduplicator';
import { runUpdateCycle, updateHospital } from '../src/main/services/update-engine';
import { parseQuery, executeSemanticQuery } from '../src/main/semantic/query-engine';
import { startScheduler, stopScheduler, getSchedulerConfig } from '../src/main/services/scheduler';
import { IPC_CHANNELS } from '../src/shared/types';

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#FAFBFC',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false,
  });

  // Load renderer
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ============================================================================
// App Lifecycle
// ============================================================================
app.whenReady().then(() => {
  initializeDatabase();
  createWindow();
  registerIpcHandlers();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  stopScheduler();
  closeDatabase();
  if (process.platform !== 'darwin') app.quit();
});

// ============================================================================
// IPC Handlers — Bridge between renderer and backend
// ============================================================================
function registerIpcHandlers(): void {
  // --- Hospital ---
  ipcMain.handle(IPC_CHANNELS.HOSPITAL_SEARCH, async (_event, query: string) => {
    return HospitalRepo.search(query);
  });

  ipcMain.handle(IPC_CHANNELS.HOSPITAL_GET, async (_event, id: string) => {
    return HospitalRepo.getById(id);
  });

  ipcMain.handle(IPC_CHANNELS.HOSPITAL_LIST_BY_STATE, async (_event, state: string) => {
    return HospitalRepo.listByState(state);
  });

  ipcMain.handle(IPC_CHANNELS.HOSPITAL_GET_STATS, async () => {
    return HospitalRepo.getStats();
  });

  // --- Ingestion ---
  ipcMain.handle(IPC_CHANNELS.INGESTION_DISCOVER, async () => {
    const count = await discoverHospitalsFromCMS((progress) => {
      mainWindow?.webContents.send('ingestion:progress', progress);
    });
    return { count };
  });

  ipcMain.handle(IPC_CHANNELS.INGESTION_SCRAPE_FILE, async (_event, hospitalId: string) => {
    const hospital = HospitalRepo.getById(hospitalId);
    if (!hospital) throw new Error('Hospital not found');

    const files = await detectTransparencyFiles(hospitalId, hospital.website_url);
    for (const file of files) {
      const fileId = FileRepo.upsert(file);

      const download = await downloadManager.download(fileId, file.file_url, hospitalId);
      if (!download.success || !download.localPath) continue;

      FileRepo.updateStatus(fileId, 'processing');
      const result = normalizeFile(download.localPath, file.file_type, hospitalId, fileId);
      let records = deduplicateRecords(result.records);
      records = normalizeDescriptions(records);
      const upsertResult = PricingRepo.upsertCurrent(records);

      FileRepo.updateStatus(fileId, 'processed');

      return {
        filesFound: files.length,
        recordsProcessed: result.rawRowCount,
        recordsValid: result.validRowCount,
        added: upsertResult.added,
        changed: upsertResult.changed,
        errors: result.errors,
      };
    }

    return { filesFound: files.length, recordsProcessed: 0, recordsValid: 0, added: 0, changed: 0, errors: [] };
  });

  // --- Update ---
  ipcMain.handle(IPC_CHANNELS.UPDATE_RUN, async () => {
    const result = await runUpdateCycle(30, (progress) => {
      mainWindow?.webContents.send(IPC_CHANNELS.UPDATE_STATUS, progress);
    });
    return result;
  });

  ipcMain.handle(IPC_CHANNELS.UPDATE_LOG, async (_event, limit?: number) => {
    return UpdateLogRepo.getRecent(limit ?? 100);
  });

  // --- Analytics ---
  ipcMain.handle(IPC_CHANNELS.ANALYTICS_STATE_MAP, async (_event, billingCode?: string, priceType?: string) => {
    return AnalyticsRepo.getStateAverages(billingCode, priceType);
  });

  ipcMain.handle(IPC_CHANNELS.ANALYTICS_TRENDS, async (_event, billingCode: string, state?: string, areaCode?: string) => {
    return AnalyticsRepo.getTrends(billingCode, state, areaCode);
  });

  ipcMain.handle(IPC_CHANNELS.ANALYTICS_VARIABILITY, async (_event, limit?: number) => {
    return AnalyticsRepo.getVariability(limit ?? 10);
  });

  ipcMain.handle(IPC_CHANNELS.ANALYTICS_COMPARISON, async (_event, billingCode: string, areaCode: string, startDate: string, endDate: string) => {
    return AnalyticsRepo.getComparison(billingCode, areaCode, startDate, endDate);
  });

  // --- Semantic Query ---
  ipcMain.handle(IPC_CHANNELS.SEMANTIC_QUERY, async (_event, query: string) => {
    return executeSemanticQuery(query);
  });

  // --- Settings ---
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, async () => {
    return getSchedulerConfig();
  });

  // --- DB ---
  ipcMain.handle(IPC_CHANNELS.DB_STATUS, async () => {
    return AnalyticsRepo.getDashboardStats();
  });
}
