export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogMetadata {
  [key: string]: unknown
}

export class Logger {
  constructor(private readonly minLevel: LogLevel = 'info') {}

  public debug(message: string, metadata?: LogMetadata): void {
    this.log('debug', message, metadata)
  }

  public info(message: string, metadata?: LogMetadata): void {
    this.log('info', message, metadata)
  }

  public warn(message: string, metadata?: LogMetadata): void {
    this.log('warn', message, metadata)
  }

  public error(message: string, metadata?: LogMetadata): void {
    this.log('error', message, metadata)
  }

  private log(level: LogLevel, message: string, metadata?: LogMetadata): void {
    if (!this.shouldLog(level)) return

    const timestamp = new Date().toISOString()
    const logData = {
      timestamp,
      level,
      message,
      ...metadata
    }

    switch (level) {
      case 'debug':
        console.debug(JSON.stringify(logData))
        break
      case 'info':
        console.info(JSON.stringify(logData))
        break
      case 'warn':
        console.warn(JSON.stringify(logData))
        break
      case 'error':
        console.error(JSON.stringify(logData))
        break
    }
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error']
    const minLevelIndex = levels.indexOf(this.minLevel)
    const currentLevelIndex = levels.indexOf(level)
    return currentLevelIndex >= minLevelIndex
  }
}
