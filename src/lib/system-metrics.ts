/**
 * System Metrics Collection
 *
 * Collects Node.js process and OS-level metrics for monitoring.
 * Used by the admin dashboard System tab.
 */

import os from "os";

// =============================================================================
// Types
// =============================================================================

export interface CPUMetrics {
  /** 1-minute load average (normalized by cores) */
  loadAvg1m: number;
  /** 5-minute load average (normalized by cores) */
  loadAvg5m: number;
  /** 15-minute load average (normalized by cores) */
  loadAvg15m: number;
  /** Total CPU cores */
  cores: number;
  /** Raw load averages */
  loadAvgRaw: [number, number, number];
}

export interface MemoryMetrics {
  /** RSS (Resident Set Size) - total memory allocated for process */
  rss: number;
  /** V8 heap total */
  heapTotal: number;
  /** V8 heap used */
  heapUsed: number;
  /** V8 external memory (C++ objects bound to JS) */
  external: number;
  /** Array buffers */
  arrayBuffers: number;
  /** Heap used percentage */
  heapUsedPercent: number;
}

export interface SystemMemoryMetrics {
  /** Total system memory */
  total: number;
  /** Free system memory */
  free: number;
  /** Used system memory */
  used: number;
  /** Memory usage percentage */
  usedPercent: number;
}

export interface EventLoopMetrics {
  /** Event loop lag in milliseconds (time since last check) */
  lagMs: number;
  /** Whether the event loop is healthy (lag < 100ms) */
  isHealthy: boolean;
}

export interface ProcessMetrics {
  /** Process uptime in seconds */
  uptime: number;
  /** Process ID */
  pid: number;
  /** Node.js version */
  nodeVersion: string;
  /** Platform */
  platform: string;
  /** Architecture */
  arch: string;
}

export interface SystemMetrics {
  cpu: CPUMetrics;
  processMemory: MemoryMetrics;
  systemMemory: SystemMemoryMetrics;
  eventLoop: EventLoopMetrics;
  process: ProcessMetrics;
  collectedAt: string;
}

// =============================================================================
// Event Loop Lag Tracking
// =============================================================================

let lastEventLoopCheck = Date.now();
let eventLoopLag = 0;

// Check event loop lag every second
// A high lag indicates the event loop is blocked
function measureEventLoopLag() {
  const now = Date.now();
  const delta = now - lastEventLoopCheck;
  // Expected delta is ~1000ms (1 second)
  // Lag is how much longer than expected it took
  eventLoopLag = Math.max(0, delta - 1000);
  lastEventLoopCheck = now;
}

// Start event loop monitoring
let eventLoopInterval: NodeJS.Timeout | null = null;

export function startEventLoopMonitoring() {
  if (eventLoopInterval) return;
  eventLoopInterval = setInterval(measureEventLoopLag, 1000);
  // Don't prevent process exit
  eventLoopInterval.unref();
}

export function stopEventLoopMonitoring() {
  if (eventLoopInterval) {
    clearInterval(eventLoopInterval);
    eventLoopInterval = null;
  }
}

// Auto-start on import in production
if (process.env.NODE_ENV === "production") {
  startEventLoopMonitoring();
}

// =============================================================================
// Metric Collection
// =============================================================================

/**
 * Get current CPU metrics
 */
export function getCPUMetrics(): CPUMetrics {
  const loadAvg = os.loadavg() as [number, number, number];
  const cores = os.cpus().length;

  return {
    // Normalize by cores (1.0 = 100% of one core)
    loadAvg1m: loadAvg[0] / cores,
    loadAvg5m: loadAvg[1] / cores,
    loadAvg15m: loadAvg[2] / cores,
    cores,
    loadAvgRaw: loadAvg,
  };
}

/**
 * Get current process memory metrics
 */
export function getProcessMemoryMetrics(): MemoryMetrics {
  const mem = process.memoryUsage();

  return {
    rss: mem.rss,
    heapTotal: mem.heapTotal,
    heapUsed: mem.heapUsed,
    external: mem.external,
    arrayBuffers: mem.arrayBuffers,
    heapUsedPercent: mem.heapTotal > 0 ? (mem.heapUsed / mem.heapTotal) * 100 : 0,
  };
}

/**
 * Get system-wide memory metrics
 */
export function getSystemMemoryMetrics(): SystemMemoryMetrics {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;

  return {
    total,
    free,
    used,
    usedPercent: total > 0 ? (used / total) * 100 : 0,
  };
}

/**
 * Get event loop metrics
 */
export function getEventLoopMetrics(): EventLoopMetrics {
  return {
    lagMs: eventLoopLag,
    isHealthy: eventLoopLag < 100,
  };
}

/**
 * Get process info
 */
export function getProcessMetrics(): ProcessMetrics {
  return {
    uptime: process.uptime(),
    pid: process.pid,
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
  };
}

/**
 * Get all system metrics
 */
export function getSystemMetrics(): SystemMetrics {
  return {
    cpu: getCPUMetrics(),
    processMemory: getProcessMemoryMetrics(),
    systemMemory: getSystemMemoryMetrics(),
    eventLoop: getEventLoopMetrics(),
    process: getProcessMetrics(),
    collectedAt: new Date().toISOString(),
  };
}

// =============================================================================
// Formatters
// =============================================================================

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

/**
 * Format seconds to human readable duration
 */
export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(" ");
}

/**
 * Get a health status based on metrics
 */
export function getSystemHealth(metrics: SystemMetrics): {
  status: "healthy" | "warning" | "critical";
  issues: string[];
} {
  const issues: string[] = [];

  // Check CPU load (warning at 70%, critical at 90%)
  if (metrics.cpu.loadAvg1m > 0.9) {
    issues.push(`High CPU load: ${(metrics.cpu.loadAvg1m * 100).toFixed(0)}%`);
  } else if (metrics.cpu.loadAvg1m > 0.7) {
    issues.push(`Elevated CPU load: ${(metrics.cpu.loadAvg1m * 100).toFixed(0)}%`);
  }

  // Check heap usage (warning at 85%, critical at 95%)
  if (metrics.processMemory.heapUsedPercent > 95) {
    issues.push(`Critical heap usage: ${metrics.processMemory.heapUsedPercent.toFixed(0)}%`);
  } else if (metrics.processMemory.heapUsedPercent > 85) {
    issues.push(`High heap usage: ${metrics.processMemory.heapUsedPercent.toFixed(0)}%`);
  }

  // Check system memory (warning at 90%, critical at 95%)
  if (metrics.systemMemory.usedPercent > 95) {
    issues.push(`Critical system memory: ${metrics.systemMemory.usedPercent.toFixed(0)}%`);
  } else if (metrics.systemMemory.usedPercent > 90) {
    issues.push(`High system memory: ${metrics.systemMemory.usedPercent.toFixed(0)}%`);
  }

  // Check event loop (warning at 50ms, critical at 100ms)
  if (metrics.eventLoop.lagMs > 100) {
    issues.push(`Event loop blocked: ${metrics.eventLoop.lagMs}ms lag`);
  } else if (metrics.eventLoop.lagMs > 50) {
    issues.push(`Event loop slow: ${metrics.eventLoop.lagMs}ms lag`);
  }

  // Determine overall status
  let status: "healthy" | "warning" | "critical" = "healthy";
  if (issues.some((i) => i.includes("Critical") || i.includes("blocked"))) {
    status = "critical";
  } else if (issues.length > 0) {
    status = "warning";
  }

  return { status, issues };
}

// =============================================================================
// Background Metrics Collector
// =============================================================================

let metricsCollectorInterval: NodeJS.Timeout | null = null;

/**
 * Collect and send metrics to ClickHouse
 * This is called periodically by the background collector
 */
async function collectAndStoreMetrics(): Promise<void> {
  try {
    // Dynamic import to avoid circular dependencies and only load when needed
    const { trackSystemMetrics } = await import("./analytics/track");
    const metrics = getSystemMetrics();

    trackSystemMetrics({
      cpuUsage: metrics.cpu.loadAvg1m * 100, // Convert to percentage
      cpuCores: metrics.cpu.cores,
      loadAvg1m: metrics.cpu.loadAvgRaw[0],
      loadAvg5m: metrics.cpu.loadAvgRaw[1],
      loadAvg15m: metrics.cpu.loadAvgRaw[2],
      memoryRss: metrics.processMemory.rss,
      memoryHeapTotal: metrics.processMemory.heapTotal,
      memoryHeapUsed: metrics.processMemory.heapUsed,
      memoryExternal: metrics.processMemory.external,
      memoryArrayBuffers: metrics.processMemory.arrayBuffers,
      memoryTotal: metrics.systemMemory.total,
      memoryFree: metrics.systemMemory.free,
      eventLoopLag: metrics.eventLoop.lagMs,
      uptime: metrics.process.uptime,
    });
  } catch {
    // Silently fail - don't crash the app if analytics is down
  }
}

/**
 * Start the background metrics collector
 * Collects metrics every intervalMs (default: 60 seconds)
 */
export function startMetricsCollector(intervalMs: number = 60_000): void {
  if (metricsCollectorInterval) return;

  // Start event loop monitoring if not already started
  startEventLoopMonitoring();

  // Collect immediately, then on interval
  collectAndStoreMetrics();

  metricsCollectorInterval = setInterval(collectAndStoreMetrics, intervalMs);
  // Don't prevent process exit
  metricsCollectorInterval.unref();

  console.log(`[SYSTEM METRICS] Background collector started (interval: ${intervalMs / 1000}s)`);
}

/**
 * Stop the background metrics collector
 */
export function stopMetricsCollector(): void {
  if (metricsCollectorInterval) {
    clearInterval(metricsCollectorInterval);
    metricsCollectorInterval = null;
    console.log("[SYSTEM METRICS] Background collector stopped");
  }
}
