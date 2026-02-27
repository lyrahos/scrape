// ============================================================================
// Preload Script — Secure bridge between renderer and main process
// ============================================================================
import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../src/shared/types';

// Expose a safe API to the renderer
contextBridge.exposeInMainWorld('electronAPI', {
  // Hospital
  searchHospitals: (query: string) => ipcRenderer.invoke(IPC_CHANNELS.HOSPITAL_SEARCH, query),
  getHospital: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.HOSPITAL_GET, id),
  listHospitalsByState: (state: string) => ipcRenderer.invoke(IPC_CHANNELS.HOSPITAL_LIST_BY_STATE, state),
  getHospitalStats: () => ipcRenderer.invoke(IPC_CHANNELS.HOSPITAL_GET_STATS),

  // Ingestion
  discoverHospitals: () => ipcRenderer.invoke(IPC_CHANNELS.INGESTION_DISCOVER),
  scrapeHospitalFile: (hospitalId: string) => ipcRenderer.invoke(IPC_CHANNELS.INGESTION_SCRAPE_FILE, hospitalId),
  onIngestionProgress: (cb: (progress: unknown) => void) => {
    ipcRenderer.on('ingestion:progress', (_event, progress) => cb(progress));
  },

  // Update
  runUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_RUN),
  getUpdateLog: (limit?: number) => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_LOG, limit),
  onUpdateStatus: (cb: (status: unknown) => void) => {
    ipcRenderer.on(IPC_CHANNELS.UPDATE_STATUS, (_event, status) => cb(status));
  },
  onUpdateComplete: (cb: (result: unknown) => void) => {
    ipcRenderer.on('update:complete', (_event, result) => cb(result));
  },

  // Analytics
  getStateMap: (billingCode?: string, priceType?: string, payer?: string, startDate?: string, endDate?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.ANALYTICS_STATE_MAP, billingCode, priceType, payer, startDate, endDate),
  getTrends: (billingCode: string, state?: string, areaCode?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.ANALYTICS_TRENDS, billingCode, state, areaCode),
  getTrendsComparison: (billingCode: string, hospitalId?: string, areaCode?: string, state?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.ANALYTICS_TRENDS_COMPARISON, billingCode, hospitalId, areaCode, state),
  getVariability: (limit?: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.ANALYTICS_VARIABILITY, limit),
  getComparison: (billingCode: string, areaCode: string, startDate: string, endDate: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.ANALYTICS_COMPARISON, billingCode, areaCode, startDate, endDate),

  // Semantic
  semanticQuery: (query: string) => ipcRenderer.invoke(IPC_CHANNELS.SEMANTIC_QUERY, query),

  // Settings
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),

  // DB
  getDbStatus: () => ipcRenderer.invoke(IPC_CHANNELS.DB_STATUS),
});

// Type declaration for renderer
export interface ElectronAPI {
  searchHospitals: (query: string) => Promise<unknown[]>;
  getHospital: (id: string) => Promise<unknown>;
  listHospitalsByState: (state: string) => Promise<unknown[]>;
  getHospitalStats: () => Promise<unknown>;
  discoverHospitals: () => Promise<{ count: number }>;
  scrapeHospitalFile: (hospitalId: string) => Promise<unknown>;
  onIngestionProgress: (cb: (progress: unknown) => void) => void;
  runUpdate: () => Promise<unknown>;
  getUpdateLog: (limit?: number) => Promise<unknown[]>;
  onUpdateStatus: (cb: (status: unknown) => void) => void;
  onUpdateComplete: (cb: (result: unknown) => void) => void;
  getStateMap: (billingCode?: string, priceType?: string, payer?: string, startDate?: string, endDate?: string) => Promise<unknown[]>;
  getTrends: (billingCode: string, state?: string, areaCode?: string) => Promise<unknown[]>;
  getTrendsComparison: (billingCode: string, hospitalId?: string, areaCode?: string, state?: string) => Promise<unknown[]>;
  getVariability: (limit?: number) => Promise<unknown[]>;
  getComparison: (billingCode: string, areaCode: string, startDate: string, endDate: string) => Promise<unknown[]>;
  semanticQuery: (query: string) => Promise<unknown>;
  getSettings: () => Promise<unknown>;
  getDbStatus: () => Promise<unknown>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
