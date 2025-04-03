import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestFactory, waitForCondition } from '../helpers'
import { Queue, JobsOptions } from 'bullmq'
import { z } from 'zod'

// Define test job schemas
const ExecutionJobSchema = z.object({
  type: z.literal('execution'),
  data: z.string(),
  options: z.object({
    priority: z.number().optional(),
    retries: z.number().optional()
  }).optional()
})

const EventJobSchema = z.object({
  type: z.literal('event'),
  eventType: z.enum(['created', 'updated', 'deleted']),
  payload: z.record(z.unknown())
})

const DatabaseJobSchema = z.object({
  type: z.literal('database'),
  operation: z.enum(['insert', 'update', 'delete']),
  table: z.string(),
  data: z.record(z.unknown())
})

type ExecutionJobData = z.infer<typeof ExecutionJobSchema>
type EventJobData = z.infer<typeof EventJobSchema>
type DatabaseJobData = z.infer<typeof DatabaseJobSchema>

describe('Job Validation Integration', () => {
  let cleanup: () => Promise<void>
  let factory: Awaited<ReturnType<typeof createTestFactory>>['factory']
  let executionQueue: Queue<ExecutionJobData>
  let eventsQueue: Queue<EventJobData>
  let databaseQueue: Queue<DatabaseJobData>

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

  describe('Execution Job Validation', () => {
    it('should accept valid execution job data', async () => {
      const jobData: ExecutionJobData = {
        type: 'execution' as const,
        data: 'test execution',
        options: {
          priority: 1,
          retries: 3
        }
      }

      const validationResult = ExecutionJobSchema.safeParse(jobData)
      expect(validationResult.success).toBe(true)

      const job = await executionQueue.add('test-execution', jobData)
      expect(job.data).toEqual(jobData)
    })

    it('should reject invalid execution job data', async () => {
      const invalidJobData = {
        type: 'execution',
        data: 123, // Should be string
        options: {
          priority: 'high' // Should be number
        }
      }

      const validationResult = ExecutionJobSchema.safeParse(invalidJobData)
      expect(validationResult.success).toBe(false)
      expect(() => ExecutionJobSchema.parse(invalidJobData)).toThrow()
    })
  })

  describe('Event Job Validation', () => {
    it('should accept valid event job data', async () => {
      const jobData: EventJobData = {
        type: 'event' as const,
        eventType: 'created' as const,
        payload: {
          id: 1,
          name: 'test'
        }
      }

      const validationResult = EventJobSchema.safeParse(jobData)
      expect(validationResult.success).toBe(true)

      const job = await eventsQueue.add('test-event', jobData)
      expect(job.data).toEqual(jobData)
    })

    it('should reject invalid event job data', async () => {
      const invalidJobData = {
        type: 'event',
        eventType: 'invalid', // Not in enum
        payload: 'not an object' // Should be record
      }

      const validationResult = EventJobSchema.safeParse(invalidJobData)
      expect(validationResult.success).toBe(false)
      expect(() => EventJobSchema.parse(invalidJobData)).toThrow()
    })
  })

  describe('Database Job Validation', () => {
    it('should accept valid database job data', async () => {
      const jobData: DatabaseJobData = {
        type: 'database' as const,
        operation: 'insert' as const,
        table: 'users',
        data: {
          id: 1,
          name: 'test user'
        }
      }

      const validationResult = DatabaseJobSchema.safeParse(jobData)
      expect(validationResult.success).toBe(true)

      const job = await databaseQueue.add('test-database', jobData)
      expect(job.data).toEqual(jobData)
    })

    it('should reject invalid database job data', async () => {
      const invalidJobData = {
        type: 'database',
        operation: 'invalid', // Not in enum
        table: 123, // Should be string
        data: null // Should be record
      }

      const validationResult = DatabaseJobSchema.safeParse(invalidJobData)
      expect(validationResult.success).toBe(false)
      expect(() => DatabaseJobSchema.parse(invalidJobData)).toThrow()
    })
  })

  describe('Job Processing with Validation', () => {
    it('should process valid jobs successfully', async () => {
      // Add all valid jobs
      await Promise.all([
        executionQueue.add('execution-job', {
          type: 'execution' as const,
          data: 'test execution'
        }),
        eventsQueue.add('event-job', {
          type: 'event' as const,
          eventType: 'created' as const,
          payload: { id: 1 }
        }),
        databaseQueue.add('database-job', {
          type: 'database' as const,
          operation: 'insert' as const,
          table: 'users',
          data: { id: 1 }
        })
      ])

      // Wait for all jobs to be processed
      await Promise.all([
        waitForCondition(async () => {
          const jobCounts = await executionQueue.getJobCounts()
          return jobCounts.completed === 1
        }),
        waitForCondition(async () => {
          const jobCounts = await eventsQueue.getJobCounts()
          return jobCounts.completed === 1
        }),
        waitForCondition(async () => {
          const jobCounts = await databaseQueue.getJobCounts()
          return jobCounts.completed === 1
        })
      ])

      // Verify all jobs were processed successfully
      const queues = [executionQueue, eventsQueue, databaseQueue]
      for (const queue of queues) {
        const jobCounts = await queue.getJobCounts()
        expect(jobCounts.completed).toBe(1)
        expect(jobCounts.failed).toBe(0)
      }
    })

    it('should handle validation errors during processing', async () => {
      // Add invalid jobs
      await Promise.all([
        executionQueue.add('invalid-execution', {
          type: 'execution' as const,
          data: 123 // Invalid: should be string
        } as unknown as ExecutionJobData),
        eventsQueue.add('invalid-event', {
          type: 'event' as const,
          eventType: 'invalid' // Invalid: not in enum
        } as unknown as EventJobData)
      ])

      // Wait for jobs to fail
      await Promise.all([
        waitForCondition(async () => {
          const jobCounts = await executionQueue.getJobCounts()
          return jobCounts.failed === 1
        }),
        waitForCondition(async () => {
          const jobCounts = await eventsQueue.getJobCounts()
          return jobCounts.failed === 1
        })
      ])

      // Verify jobs failed with validation errors
      const failedQueues = [executionQueue, eventsQueue]
      for (const queue of failedQueues) {
        const failedJobs = await queue.getJobs(['failed'])
        expect(failedJobs[0].failedReason).toContain('validation')
      }
    })
  })
})
