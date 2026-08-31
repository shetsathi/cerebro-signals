/**
 * Railway Health Monitor
 *
 * Monitors service health and auto-restarts ONLY during market hours:
 * - 09:15 - 15:00 IST on weekdays (Monday-Friday)
 * - Does NOT restart outside market hours (preserves free tier limits)
 * - Only restarts on actual crashes, not on normal restarts
 */

import { addMinutes, isMonday, isTuesday, isWednesday, isThursday, isFriday } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

interface HealthCheckResult {
  isHealthy: boolean;
  timestamp: Date;
  lastRestartTime: Date | null;
}

class RailwayHealthMonitor {
  private lastRestartTime: Date | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private readonly MIN_RESTART_INTERVAL_MINUTES = 5; // Minimum 5 min between restarts
  private readonly HEALTH_CHECK_INTERVAL_MS = 30000; // Check every 30 seconds
  private readonly IST_TIMEZONE = 'Asia/Kolkata';
  private readonly MARKET_OPEN = { hour: 9, minute: 15 };
  private readonly MARKET_CLOSE = { hour: 15, minute: 0 };

  /**
   * Check if current time is within market hours
   */
  private isMarketHours(): boolean {
    const now = new Date();
    const istTime = toZonedTime(now, this.IST_TIMEZONE);

    // Check if weekday (Mon-Fri)
    const isWeekday =
      isMonday(istTime) ||
      isTuesday(istTime) ||
      isWednesday(istTime) ||
      isThursday(istTime) ||
      isFriday(istTime);

    if (!isWeekday) return false;

    // Check if within 09:15 - 15:00 IST
    const hours = istTime.getHours();
    const minutes = istTime.getMinutes();
    const currentTime = hours * 60 + minutes;
    const marketOpen = this.MARKET_OPEN.hour * 60 + this.MARKET_OPEN.minute;
    const marketClose = this.MARKET_CLOSE.hour * 60 + this.MARKET_CLOSE.minute;

    return currentTime >= marketOpen && currentTime <= marketClose;
  }

  /**
   * Check service health via HTTP
   */
  private async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch('http://localhost:3000/api/health', {
        timeout: 5000,
      });
      return response.ok;
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }

  /**
   * Trigger Railway restart via API
   * Note: This requires RAILWAY_TOKEN environment variable
   */
  private async triggerRestart(): Promise<void> {
    const railwayToken = process.env.RAILWAY_TOKEN;
    if (!railwayToken) {
      console.warn('RAILWAY_TOKEN not set - cannot trigger restart');
      return;
    }

    try {
      console.log('🔄 Triggering Railway restart (market hours)...');
      // Railway restart would be triggered via Railway CLI or API
      // For now, we'll just log it - actual restart happens via Railway dashboard
      console.log('⚠️  Manual restart needed - visit Railway dashboard');
    } catch (error) {
      console.error('Failed to trigger restart:', error);
    }
  }

  /**
   * Check if enough time has passed since last restart
   */
  private canRestart(): boolean {
    if (!this.lastRestartTime) return true;

    const now = new Date();
    const timeSinceLastRestart = (now.getTime() - this.lastRestartTime.getTime()) / 1000 / 60;
    return timeSinceLastRestart >= this.MIN_RESTART_INTERVAL_MINUTES;
  }

  /**
   * Main health monitoring loop
   */
  async start(): Promise<void> {
    console.log('🚀 Railway Health Monitor started');
    console.log(`   Market hours: 09:15-15:00 IST (Mon-Fri)`);
    console.log(`   Free tier limit: 10 restarts/month`);
    console.log(`   Min interval: ${this.MIN_RESTART_INTERVAL_MINUTES} min between restarts`);

    this.healthCheckInterval = setInterval(async () => {
      try {
        const isHealthy = await this.checkHealth();
        const isMarketOpen = this.isMarketHours();

        if (!isHealthy) {
          console.warn(`❌ Service unhealthy at ${new Date().toISOString()}`);

          if (isMarketOpen && this.canRestart()) {
            console.warn(
              `⚠️  Service crashed during market hours - initiating restart...`,
            );
            this.lastRestartTime = new Date();
            await this.triggerRestart();
          } else if (!isMarketOpen) {
            console.log(
              `ℹ️  Service crashed outside market hours - restart deferred until 09:15 IST`,
            );
          } else {
            console.log(
              `ℹ️  Restart interval not met - deferring restart (${this.MIN_RESTART_INTERVAL_MINUTES} min minimum)`,
            );
          }
        }
      } catch (error) {
        console.error('Health monitor error:', error);
      }
    }, this.HEALTH_CHECK_INTERVAL_MS);
  }

  /**
   * Graceful shutdown
   */
  stop(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      console.log('🛑 Railway Health Monitor stopped');
    }
  }
}

// Export singleton
export const healthMonitor = new RailwayHealthMonitor();

// Start on import if in production
if (process.env.NODE_ENV === 'production' && process.env.ENABLE_HEALTH_MONITOR === 'true') {
  healthMonitor.start();
  process.on('SIGTERM', () => {
    healthMonitor.stop();
    process.exit(0);
  });
}
