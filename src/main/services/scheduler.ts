// ============================================================================
// Background Scheduler — Periodic updates and notifications
// ============================================================================
import { runUpdateCycle, type UpdateProgress } from './update-engine';
import { AnalyticsRepo } from '../storage/repositories';
import { BrowserWindow } from 'electron';

let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

export interface SchedulerConfig {
  intervalHours: number;
  daysSinceUpdate: number;
  enabled: boolean;
}

const DEFAULT_CONFIG: SchedulerConfig = {
  intervalHours: 24,
  daysSinceUpdate: 30,
  enabled: false,
};

let config = { ...DEFAULT_CONFIG };

export function startScheduler(newConfig?: Partial<SchedulerConfig>): void {
  if (newConfig) {
    config = { ...config, ...newConfig };
  }

  if (!config.enabled) return;
  stopScheduler();

  const intervalMs = config.intervalHours * 60 * 60 * 1000;
  schedulerTimer = setInterval(() => {
    runScheduledUpdate();
  }, intervalMs);
}

export function stopScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
}

export function isSchedulerRunning(): boolean {
  return isRunning;
}

async function runScheduledUpdate(): Promise<void> {
  if (isRunning) return;
  isRunning = true;

  try {
    const onProgress = (progress: UpdateProgress) => {
      // Send progress to renderer
      const windows = BrowserWindow.getAllWindows();
      for (const win of windows) {
        win.webContents.send('update:progress', progress);
      }
    };

    const result = await runUpdateCycle(config.daysSinceUpdate, onProgress);

    // Check for significant price changes
    await checkForPriceAlerts();

    // Notify completion
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      win.webContents.send('update:complete', result);
    }
  } finally {
    isRunning = false;
  }
}

async function checkForPriceAlerts(): Promise<void> {
  // Check for procedures with >20% price change
  const variability = AnalyticsRepo.getVariability(20);
  const alerts = variability.filter((v) => {
    if (v.avg_price === 0) return false;
    const spreadPct = (v.spread / v.avg_price) * 100;
    return spreadPct > 100; // Flag procedures with >100% spread
  });

  if (alerts.length > 0) {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      win.webContents.send('update:alerts', alerts);
    }
  }
}

export function getSchedulerConfig(): SchedulerConfig {
  return { ...config };
}
