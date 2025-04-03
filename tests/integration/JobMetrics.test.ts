import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestFactory, waitForCondition } from '../helpers'
import { Queue, QueueEvents, JobsOptions } from 'bullmq'
import type { Job } from 'bullmq'

interface MetricsJobData {
  data: string
  processingTime?: number
  shouldFail?: boolean
  shouldFailFirst?: boolean
  shouldStall?: boolean
}

interface MetricsJobOptions extends JobsOptions {
  attempts?: number
  delay?: number
}

describe('Job Metrics Integration', () => {
  let cleanup: () => Promise<void>
  let factory: Awaited<ReturnType<typeof createTestFactory>>['factory']
  let executionQueue: Queue<MetricsJobData>
  let eventsQueue: Queue<MetricsJobData>
  let databaseQueue: Queue<MetricsJobData>

  beforeEach(async () => {
    const testSetup = await createTestFactory()
    factory = testSetup.factory
    cleanup = testSetup.cleanup

    await factory.initialize()
    executionQueue = factory.getQueue('execution')
    eventsQueue = factory.getQueue('events')
    databaseQueue = factory.getQueue('database')
  })

  afterEach(async () => {
    if (cleanup) {
      await cleanup()
    }
  })

  describe('Queue Metrics', () => {
    it('should track job counts accurately', async () => {
      // Add jobs to different queues
      await Promise.all([
        executionQueue.add('exec1', { data: 'test1' }),
        executionQueue.add('exec2', { data: 'test2' }),
        eventsQueue.add('event1', { data: 'test3' }),
        databaseQueue.add('db1', { data: 'test4' })
      ])

      // Get job counts for each queue
      const executionCounts = await executionQueue.getJobCounts()
      const eventsCounts = await eventsQueue.getJobCounts()
      const databaseCounts = await databaseQueue.getJobCounts()

      // Verify initial counts
      expect(executionCounts.waiting + executionCounts.active).toBe(2)
      expect(eventsCounts.waiting + eventsCounts.active).toBe(1)
      expect(databaseCounts.waiting + databaseCounts.active).toBe(1)

      // Wait for jobs to complete
      await Promise.all([
        waitForCondition(async () => {
          const counts = await executionQueue.getJobCounts()
          return counts.completed === 2
        }),
        waitForCondition(async () => {
          const counts = await eventsQueue.getJobCounts()
          return counts.completed === 1
        }),
        waitForCondition(async () => {
          const counts = await databaseQueue.getJobCounts()
          return counts.completed === 1
        })
      ])

      // Verify final counts
      const finalExecutionCounts = await executionQueue.getJobCounts()
      const finalEventsCounts = await eventsQueue.getJobCounts()
      const finalDatabaseCounts = await databaseQueue.getJobCounts()

      expect(finalExecutionCounts.completed).toBe(2)
      expect(finalEventsCounts.completed).toBe(1)
      expect(finalDatabaseCounts.completed).toBe(1)
    })

    it('should track job processing times', async () => {
      // Add jobs with different processing times
      await Promise.all([
        executionQueue.add('fast-job', {
          data: 'test1',
          processingTime: 50
        }),
        executionQueue.add('slow-job', {
          data: 'test2',
          processingTime: 200
        })
      ])

      // Wait for jobs to complete
      await waitForCondition(async () => {
        const counts = await executionQueue.getJobCounts()
        return counts.completed === 2
      })

      // Get completed jobs
      const completedJobs = await executionQueue.getJobs(['completed'])
      const processingTimes = await Promise.all(
        completedJobs.map(async job => {
          const jobState = await job.getState()
          if (jobState === 'completed') {
            const finishedOn = job.finishedOn || 0
            const processedOn = job.processedOn || 0
            return finishedOn - processedOn
          }
          return 0
        })
      )

      // Verify processing times
      expect(processingTimes[0]).toBeGreaterThanOrEqual(50)
      expect(processingTimes[1]).toBeGreaterThanOrEqual(200)
    })
  })

  describe('Error Metrics', () => {
    it('should track failed job counts', async () => {
      // Add jobs that will fail
      await Promise.all([
        executionQueue.add('fail1', {
          data: 'test1',
          shouldFail: true
        }),
        executionQueue.add('fail2', {
          data: 'test2',
          shouldFail: true
        })
      ])

      // Wait for jobs to fail
      await waitForCondition(async () => {
        const counts = await executionQueue.getJobCounts()
        return counts.failed === 2
      })

      // Verify failed job counts
      const jobCounts = await executionQueue.getJobCounts()
      expect(jobCounts.failed).toBe(2)
      expect(jobCounts.completed).toBe(0)
    })

    it('should track retry attempts', async () => {
      // Add a job that will retry
      await executionQueue.add('retry-job', {
        data: 'test',
        shouldFailFirst: true
      }, {
        attempts: 3
      } as MetricsJobOptions)

      // Wait for job to complete or fail
      await waitForCondition(async () => {
        const counts = await executionQueue.getJobCounts()
        return counts.completed === 1 || counts.failed === 1
      })

      // Get the job and verify retry count
      const jobs = await executionQueue.getJobs(['completed', 'failed'])
      expect(jobs[0].attemptsMade).toBeGreaterThan(1)
    })
  })

  describe('Performance Metrics', () => {
    it('should track concurrent job processing', async () => {
      const totalJobs = 10
      let maxConcurrent = 0
      let currentConcurrent = 0

      // Monitor concurrent jobs
      const monitorInterval = setInterval(async () => {
        const counts = await executionQueue.getJobCounts()
        currentConcurrent = counts.active
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent)
      }, 100)

      // Add multiple jobs
      await Promise.all(
        Array.from({ length: totalJobs }).map((_, i) =>
          executionQueue.add(`job-${i}`, {
            data: `test${i}`,
            processingTime: 200
          })
        )
      )

      // Wait for all jobs to complete
      await waitForCondition(async () => {
        const counts = await executionQueue.getJobCounts()
        return counts.completed === totalJobs
      })

      clearInterval(monitorInterval)

      // Verify concurrent processing
      expect(maxConcurrent).toBeGreaterThan(1)
      expect(maxConcurrent).toBeLessThanOrEqual(5) // From test config
    })

    it('should track queue throughput', async () => {
      const startTime = Date.now()
      const totalJobs = 5

      // Add jobs
      await Promise.all(
        Array.from({ length: totalJobs }).map((_, i) =>
          executionQueue.add(`job-${i}`, {
            data: `test${i}`,
            processingTime: 100
          })
        )
      )

      // Wait for all jobs to complete
      await waitForCondition(async () => {
        const counts = await executionQueue.getJobCounts()
        return counts.completed === totalJobs
      })

      const endTime = Date.now()
      const duration = endTime - startTime
      const throughput = (totalJobs / duration) * 1000 // Jobs per second

      // Verify throughput
      expect(throughput).toBeGreaterThan(0)
    })
  })

  describe('Queue Health Metrics', () => {
    it('should track stalled jobs', async () => {
      // Add a job that will stall
      await executionQueue.add('stall-job', {
        data: 'test',
        shouldStall: true
      })

      // Wait for job to be marked as stalled
      await waitForCondition(async () => {
        const counts = await executionQueue.getJobCounts()
        return counts.stalled > 0
      })

      // Verify stalled job count
      const jobCounts = await executionQueue.getJobCounts()
      expect(jobCounts.stalled).toBeGreaterThan(0)
    })

    it('should track delayed jobs', async () => {
      // Add delayed jobs
      await Promise.all([
        executionQueue.add('delay1', { data: 'test1' }, { delay: 1000 } as MetricsJobOptions),
        executionQueue.add('delay2', { data: 'test2' }, { delay: 2000 } as MetricsJobOptions)
      ])

      // Verify delayed job count
      const jobCounts = await executionQueue.getJobCounts()
      expect(jobCounts.delayed).toBe(2)

      // Wait for jobs to complete
      await waitForCondition(async () => {
        const counts = await executionQueue.getJobCounts()
        return counts.completed === 2
      })

      // Verify final counts
      const finalCounts = await executionQueue.getJobCounts()
      expect(finalCounts.delayed).toBe(0)
      expect(finalCounts.completed).toBe(2)
    })
  })
})
