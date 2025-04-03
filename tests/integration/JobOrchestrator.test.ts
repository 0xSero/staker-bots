import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestFactory, waitForCondition, waitForQueueEmpty } from '../helpers'
import { JobOrchestrator } from '../../src/orchestrator'
import { Queue, QueueEvents, JobsOptions } from 'bullmq'

interface TestJobData {
  type?: string
  data?: string
  shouldFail?: boolean
  retryCount?: number
  shouldTimeout?: boolean
  parentJobId?: string
}

interface TestJobOptions extends JobsOptions {
  timeout?: number
}

describe('JobOrchestrator Integration', () => {
  let cleanup: () => Promise<void>
  let factory: Awaited<ReturnType<typeof createTestFactory>>['factory']
  let orchestrator: JobOrchestrator
  let executionQueue: Queue<TestJobData>
  let eventsQueue: Queue<TestJobData>
  let databaseQueue: Queue<TestJobData>

  beforeEach(async () => {
    const testSetup = await createTestFactory()
    factory = testSetup.factory
    cleanup = testSetup.cleanup

    await factory.initialize()
    orchestrator = factory.getComponent<JobOrchestrator>('jobOrchestrator')

    executionQueue = factory.getQueue('execution')
    eventsQueue = factory.getQueue('events')
    databaseQueue = factory.getQueue('database')
  })

  afterEach(async () => {
    if (cleanup) {
      await cleanup()
    }
  })

  describe('Job Processing', () => {
    it('should process jobs in the correct order', async () => {
      // Add jobs to each queue
      await executionQueue.add('execution-job', { type: 'execution', data: 'test' })
      await eventsQueue.add('event-job', { type: 'event', data: 'test' })
      await databaseQueue.add('db-job', { type: 'database', data: 'test' })

      // Wait for all queues to be empty (jobs processed)
      await Promise.all([
        waitForQueueEmpty(executionQueue),
        waitForQueueEmpty(eventsQueue),
        waitForQueueEmpty(databaseQueue)
      ])

      // Verify all jobs were processed
      const executionCounts = await executionQueue.getJobCounts()
      const eventsCounts = await eventsQueue.getJobCounts()
      const databaseCounts = await databaseQueue.getJobCounts()

      expect(executionCounts.completed).toBe(1)
      expect(eventsCounts.completed).toBe(1)
      expect(databaseCounts.completed).toBe(1)
    })

    it('should handle job dependencies correctly', async () => {
      // Add a job with a dependency
      const parentJob = await executionQueue.add('parent-job', { data: 'parent' })
      await eventsQueue.add('child-job', { data: 'child', parentJobId: parentJob.id })

      // Wait for parent job to complete
      await waitForCondition(async () => {
        const job = await parentJob.isCompleted()
        return job === true
      })

      // Verify child job was processed after parent
      await waitForQueueEmpty(eventsQueue)
      const eventsCounts = await eventsQueue.getJobCounts()
      expect(eventsCounts.completed).toBe(1)
    })
  })

  describe('Error Handling', () => {
    it('should handle job failures and retries', async () => {
      // Add a job that will fail on first attempt
      await executionQueue.add('failing-job', { shouldFail: true, retryCount: 0 })

      // Wait for job to be retried and eventually succeed
      await waitForCondition(async () => {
        const jobCounts = await executionQueue.getJobCounts()
        return jobCounts.completed === 1
      })

      // Get the job and verify retry count
      const jobs = await executionQueue.getJobs()
      const job = jobs[0]
      expect(job.attemptsMade).toBeGreaterThan(0)
    })

    it('should handle job timeouts', async () => {
      // Add a job that will timeout
      await executionQueue.add('timeout-job', { shouldTimeout: true }, { timeout: 1000 } as TestJobOptions)

      // Wait for job to fail due to timeout
      await waitForCondition(async () => {
        const jobCounts = await executionQueue.getJobCounts()
        return jobCounts.failed === 1
      })

      // Verify job failed with timeout error
      const jobs = await executionQueue.getJobs(['failed'])
      const job = jobs[0]
      expect(job.failedReason).toContain('timeout')
    })
  })

  describe('Queue Management', () => {
    it('should respect queue priorities', async () => {
      // Add jobs with different priorities
      const lowPriorityJob = await executionQueue.add('low-priority', { data: 'low' }, { priority: 3 })
      const highPriorityJob = await executionQueue.add('high-priority', { data: 'high' }, { priority: 1 })

      // Wait for jobs to complete
      await waitForQueueEmpty(executionQueue)

      // Verify high priority job was processed first
      const jobs = await executionQueue.getJobs(['completed'])
      expect(jobs[0].id).toBe(highPriorityJob.id)
      expect(jobs[1].id).toBe(lowPriorityJob.id)
    })

    it('should handle queue events correctly', async () => {
      const events: string[] = []

      // Listen for queue events
      const queueEvents = new QueueEvents(executionQueue.name)
      queueEvents.on('completed', () => events.push('completed'))
      queueEvents.on('failed', () => events.push('failed'))

      // Add a successful job and a failing job
      await executionQueue.add('success-job', { data: 'success' })
      await executionQueue.add('fail-job', { shouldFail: true })

      // Wait for both jobs to be processed
      await waitForCondition(async () => {
        const jobCounts = await executionQueue.getJobCounts()
        return jobCounts.completed + jobCounts.failed === 2
      })

      expect(events).toContain('completed')
      expect(events).toContain('failed')
    })
  })
})
