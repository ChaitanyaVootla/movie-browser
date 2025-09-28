// Simple logger utility for Lambda
export class Logger {
    private logLevel: string;

    constructor() {
        this.logLevel = process.env.LOG_LEVEL || 'info';
    }

    private shouldLog(level: string): boolean {
        const levels = ['trace', 'debug', 'info', 'warn', 'error'];
        const currentLevelIndex = levels.indexOf(this.logLevel);
        const targetLevelIndex = levels.indexOf(level);
        return targetLevelIndex >= currentLevelIndex;
    }

    private formatMessage(level: string, message: string, data?: any): string {
        const timestamp = new Date().toISOString();
        const logData = data ? ` ${JSON.stringify(data)}` : '';
        return `[${timestamp}] ${level.toUpperCase()}: ${message}${logData}`;
    }

    trace(message: string, data?: any): void {
        if (this.shouldLog('trace')) {
            console.log(this.formatMessage('trace', message, data));
        }
    }

    debug(message: string, data?: any): void {
        if (this.shouldLog('debug')) {
            console.log(this.formatMessage('debug', message, data));
        }
    }

    info(message: string, data?: any): void {
        if (this.shouldLog('info')) {
            console.log(this.formatMessage('info', message, data));
        }
    }

    warn(message: string, data?: any): void {
        if (this.shouldLog('warn')) {
            console.warn(this.formatMessage('warn', message, data));
        }
    }

    error(message: string, error?: any): void {
        if (this.shouldLog('error')) {
            const errorData = error instanceof Error ? {
                message: error.message,
                stack: error.stack,
                name: error.name
            } : error;
            console.error(this.formatMessage('error', message, errorData));
        }
    }
}

export const logger = new Logger();
