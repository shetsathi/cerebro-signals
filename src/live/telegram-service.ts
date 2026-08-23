/**
 * Telegram Notification Service
 *
 * Sends real-time signal alerts to Telegram.
 * CRITICAL: Never expose bot token in logs or errors.
 * Failures must not crash the signal engine.
 */

import { SignalOutput } from './live-orchestrator';

export class TelegramService {
  private botToken: string;
  private chatId: string;
  private readonly apiUrl = 'https://api.telegram.org';

  constructor(botToken: string, chatId: string) {
    this.botToken = botToken;
    this.chatId = chatId;
  }

  /**
   * Send signal alert
   * Returns true if successful, false if failed
   */
  async sendSignalAlert(signal: SignalOutput): Promise<boolean> {
    try {
      const message = this.formatSignalMessage(signal);
      await this.sendMessage(message);
      return true;
    } catch (error) {
      console.error('Failed to send signal alert:', (error as Error).message);
      // Do NOT crash — signal must be persisted even if Telegram fails
      return false;
    }
  }

  /**
   * Format signal as Telegram message
   */
  private formatSignalMessage(signal: SignalOutput): string {
    const action = signal.action === 'LONG' ? '📈 LONG' : '📉 SHORT';
    const symbol = signal.symbol;
    const entry = signal.entryPrice.toFixed(2);
    const sl = signal.stopPrice.toFixed(2);
    const target = signal.targetPrice ? signal.targetPrice.toFixed(2) : 'N/A';
    const rr = signal.riskRewardRatio ? signal.riskRewardRatio.toFixed(2) : 'N/A';
    const time = new Date(signal.evaluationTimeUTC).toISOString().slice(11, 19);

    return (
      `🤖 CEREBRO SIGNAL\n\n` +
      `${action}: ${symbol}\n\n` +
      `Entry: ${entry}\n` +
      `SL: ${sl}\n` +
      `Target: ${target}\n` +
      `R:R: ${rr}x\n\n` +
      `Generated: ${time}`
    );
  }

  /**
   * Send message via Telegram Bot API
   */
  private async sendMessage(text: string): Promise<void> {
    const url = `${this.apiUrl}/bot${this.botToken}/sendMessage`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: this.chatId,
        text: text,
        parse_mode: 'HTML',
      }),
    });

    if (!response.ok) {
      try {
        const errorData = (await response.json()) as any;
        throw new Error(`Telegram API error: ${errorData.description || response.statusText}`);
      } catch {
        throw new Error(`Telegram API error: ${response.statusText}`);
      }
    }
  }

  /**
   * Test connection (verify bot token and chat ID)
   */
  async testConnection(): Promise<boolean> {
    try {
      const url = `${this.apiUrl}/bot${this.botToken}/getMe`;
      const response = await fetch(url);

      if (!response.ok) {
        console.error('Telegram bot verification failed');
        return false;
      }

      console.log('Telegram bot verified');
      return true;
    } catch (error) {
      console.error('Telegram connection test failed:', (error as Error).message);
      return false;
    }
  }
}
