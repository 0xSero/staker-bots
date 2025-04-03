import { Job } from 'bullmq'

export enum DatabaseOperationType {
  CREATE_DEPOSIT = 'create-deposit',
  UPDATE_DEPOSIT = 'update-deposit',
  GET_DEPOSIT = 'get-deposit',
  GET_ALL_DEPOSITS = 'get-all-deposits',
  UPDATE_CHECKPOINT = 'update-checkpoint',
  GET_CHECKPOINT = 'get-checkpoint',
  CREATE_EVENT = 'create-event',
  GET_EVENTS = 'get-events'
}

export interface Deposit {
  id: string
  ownerAddress: string
  delegateeAddress: string
  amount: string // BigInt as string
  blockNumber: number
  transactionHash: string
  timestamp: number
}

export interface ProcessingCheckpoint {
  componentType: string
  lastBlockNumber: number
  blockHash: string
  lastUpdate: number
}

export interface Event {
  id: string
  eventType: string
  blockNumber: number
  transactionHash: string
  data: Record<string, any>
  timestamp: number
}

export interface DatabaseJobData {
  operationType: DatabaseOperationType
  params: Record<string, any>
  requestId: string
  timestamp: number
}

export interface DatabaseJobResult {
  success: boolean
  error?: string
  data?: any
  requestId: string
  operationType: DatabaseOperationType
  timestamp: number
}

export type DatabaseJob = Job<DatabaseJobData, DatabaseJobResult>

export const DATABASE_JOB_OPTIONS = {
  attempts: 3,
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

// Request/Response types for specific operations
export interface CreateDepositRequest {
  deposit: Omit<Deposit, 'id'>
}

export interface UpdateDepositRequest {
  id: string
  updates: Partial<Omit<Deposit, 'id'>>
}

export interface GetDepositRequest {
  id: string
}

export interface GetAllDepositsRequest {
  filter?: {
    ownerAddress?: string
    delegateeAddress?: string
    fromBlock?: number
    toBlock?: number
  }
}

export interface UpdateCheckpointRequest {
  checkpoint: ProcessingCheckpoint
}

export interface GetCheckpointRequest {
  componentType: string
}

export interface CreateEventRequest {
  event: Omit<Event, 'id'>
}

export interface GetEventsRequest {
  filter?: {
    eventType?: string
    fromBlock?: number
    toBlock?: number
    fromTimestamp?: number
    toTimestamp?: number
  }
  limit?: number
  offset?: number
}
