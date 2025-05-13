/**
 * Base monitor interface defining the contract for all monitor implementations
 */

export interface MonitorStatus {
  isRunning: boolean
  lastCheckTimestamp?: number
  lastEventTimestamp?: number
  eventsProcessed: number
  errors: Array<{
    timestamp: number
    message: string
  }>
}

export interface BaseMonitor {
  /**
   * Start the monitor
   */
  start(): Promise<void>
  
  /**
   * Stop the monitor
   */
  stop(): Promise<void>
  
  /**
   * Get the current status of the monitor
   */
  getStatus(): Promise<MonitorStatus>
} 