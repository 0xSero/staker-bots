import { Logger } from '../shared/Logger'
import { ComponentHealth, SystemHealth } from './types'
import { EventEmitter } from 'events'

export interface HealthCheckConfig {
  checkInterval: number
  unhealthyThreshold: number
  recoveryThreshold: number
}

export class HealthMonitor extends EventEmitter {
  private static instance: HealthMonitor
  private componentStatus: Map<string, ComponentHealth> = new Map()
  private checkInterval?: NodeJS.Timeout
  private recoveryAttempts: Map<string, number> = new Map()

  private constructor(
    private config: HealthCheckConfig,
    private logger: Logger
  ) {
    super()
  }

  public static getInstance(config: HealthCheckConfig, logger: Logger): HealthMonitor {
    if (!HealthMonitor.instance) {
      HealthMonitor.instance = new HealthMonitor(config, logger)
    }
    return HealthMonitor.instance
  }

  public start(): void {
    if (this.checkInterval) {
      this.logger.warn('Health monitor is already running')
      return
    }

    this.logger.info('Starting health monitor...')
    this.checkInterval = setInterval(() => {
      this.checkSystemHealth()
    }, this.config.checkInterval)
  }

  public stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
      this.checkInterval = undefined
      this.logger.info('Health monitor stopped')
    }
  }

  public updateStatus(component: string, status: ComponentHealth['status'], message?: string): void {
    const currentHealth = this.componentStatus.get(component) || {
      status: 'healthy',
      lastChecked: new Date(),
      errorCount: 0
    }

    const previousStatus = currentHealth.status
    currentHealth.status = status
    currentHealth.lastChecked = new Date()
    currentHealth.message = message

    if (status === 'unhealthy' || status === 'degraded') {
      currentHealth.errorCount++
      if (currentHealth.errorCount >= this.config.unhealthyThreshold) {
        currentHealth.status = 'unhealthy'
        this.emit('componentUnhealthy', { component, health: currentHealth })
      }
    } else {
      currentHealth.errorCount = 0
      if (previousStatus === 'unhealthy') {
        this.emit('componentRecovered', { component, health: currentHealth })
      }
    }

    this.componentStatus.set(component, currentHealth)
    this.emit('healthUpdate', { component, health: currentHealth })
  }

  public getSystemHealth(): SystemHealth {
    const components = Object.fromEntries(this.componentStatus)
    const unhealthyCount = Array.from(this.componentStatus.values())
      .filter(health => health.status === 'unhealthy').length

    let overall: SystemHealth['overall'] = 'healthy'
    if (unhealthyCount > 0) {
      overall = unhealthyCount >= this.componentStatus.size / 2 ? 'unhealthy' : 'degraded'
    }

    return {
      overall,
      components,
      timestamp: new Date()
    }
  }

  public async attemptRecovery(component: string): Promise<void> {
    const health = this.componentStatus.get(component)
    if (!health || health.status === 'healthy') return

    const attempts = this.recoveryAttempts.get(component) || 0
    if (attempts >= this.config.recoveryThreshold) {
      this.logger.error('Recovery threshold exceeded for component', { component })
      return
    }

    try {
      this.logger.info('Attempting recovery for component', { component })
      this.emit('recoveryAttempt', { component, attempts })

      // Increment recovery attempts
      this.recoveryAttempts.set(component, attempts + 1)

      // Reset after successful recovery
      this.updateStatus(component, 'healthy')
      this.recoveryAttempts.delete(component)
    } catch (error) {
      this.logger.error('Recovery attempt failed', {
        component,
        error: error instanceof Error ? error : new Error(String(error))
      })
    }
  }

  private checkSystemHealth(): void {
    const health = this.getSystemHealth()

    if (health.overall !== 'healthy') {
      this.logger.warn('System health is degraded', { health })
      this.emit('systemDegraded', health)

      // Attempt recovery for unhealthy components
      Object.entries(health.components)
        .filter(([_, health]) => health.status === 'unhealthy')
        .forEach(([component]) => {
          this.attemptRecovery(component)
        })
    }
  }
}
