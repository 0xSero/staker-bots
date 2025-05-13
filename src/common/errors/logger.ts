import { ErrorSeverity } from './types'

export interface Logger {
  debug(message: string, context?: Record<string, any>): Promise<void>
  info(message: string, context?: Record<string, any>): Promise<void>
  warn(message: string, context?: Record<string, any>): Promise<void>
  error(error: Error, context?: Record<string, any>): Promise<void>
}

export class ConsoleLogger implements Logger {
  constructor(private readonly component: string) {}

  private formatMessage(message: string, context?: Record<string, any>): string {
    const timestamp = new Date().toISOString()
    const contextStr = context ? ` ${JSON.stringify(context)}` : ''
    return `[${timestamp}] [${this.component}] ${message}${contextStr}`
  }

  async debug(message: string, context?: Record<string, any>): Promise<void> {
    console.debug(this.formatMessage(message, context))
  }

  async info(message: string, context?: Record<string, any>): Promise<void> {
    console.info(this.formatMessage(message, context))
  }

  async warn(message: string, context?: Record<string, any>): Promise<void> {
    console.warn(this.formatMessage(message, context))
  }

  async error(error: Error, context?: Record<string, any>): Promise<void> {
    console.error(
      this.formatMessage(error.message, {
        ...context,
        stack: error.stack,
      })
    )
  }
}

export interface ErrorLogger {
  error(error: Error, context?: Record<string, any>): Promise<void>
  warn(message: string, context?: Record<string, any>): Promise<void>
  info(message: string, context?: Record<string, any>): Promise<void>
  debug(message: string, context?: Record<string, any>): Promise<void>
}

export class ConsoleErrorLogger implements ErrorLogger {
  constructor(private readonly component: string) {}

  private formatMessage(
    severity: ErrorSeverity,
    message: string,
    context?: Record<string, any>
  ): string {
    const timestamp = new Date().toISOString()
    const contextStr = context ? ` ${JSON.stringify(context)}` : ''
    return `[${timestamp}] [${this.component}] [${severity}] ${message}${contextStr}`
  }

  async error(error: Error, context?: Record<string, any>): Promise<void> {
    console.error(
      this.formatMessage(ErrorSeverity.ERROR, error.message, {
        ...context,
        stack: error.stack,
      })
    )
  }

  async warn(message: string, context?: Record<string, any>): Promise<void> {
    console.warn(this.formatMessage(ErrorSeverity.WARN, message, context))
  }

  async info(message: string, context?: Record<string, any>): Promise<void> {
    console.info(this.formatMessage(ErrorSeverity.INFO, message, context))
  }

  async debug(message: string, context?: Record<string, any>): Promise<void> {
    console.debug(this.formatMessage(ErrorSeverity.DEBUG, message, context))
  }
} 