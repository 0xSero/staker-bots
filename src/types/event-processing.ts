import { Job } from 'bullmq'

export interface EventProcessingJobData {
  eventType: string
  blockNumber: number
  transactionHash: string
  eventData: Record<string, any>
  timestamp: number
}

export interface EventProcessingJobResult {
  success: boolean
  error?: string
  processedAt: number
  blockNumber: number
  eventType: string
  message?: string
}

export type EventProcessingJob = Job<EventProcessingJobData, EventProcessingJobResult>

export const EVENT_PROCESSING_JOB_OPTIONS = {
  attempts: 5,
  backoff: {
    type: 'exponential' as const,
    delay: 1000
  },
  removeOnComplete: {
    age: 24 * 3600, // Keep successful jobs for 24 hours
    count: 1000 // Keep last 1000 successful jobs
  },
  removeOnFail: {
    age: 7 * 24 * 3600 // Keep failed jobs for 7 days
  }
}
