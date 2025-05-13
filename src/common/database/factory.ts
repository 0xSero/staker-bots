/**
 * Database factory for creating database instances
 */
import { Database } from './interfaces/database'
import { ErrorType, ErrorSeverity, BaseError } from '../errors/types'

export class DatabaseError extends BaseError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, context, false, ErrorType.DATABASE_ERROR, ErrorSeverity.ERROR)
    this.name = 'DatabaseError'
  }
}

/**
 * Database type options
 */
export type DatabaseType = 'json' | 'supabase' | 'mongodb'

/**
 * Database configuration
 */
export interface DatabaseConfig {
  type: 'json' | 'supabase'
  connectionString?: string
  filePath?: string
}

/**
 * Create a database instance based on type
 * 
 * @param config Database configuration
 * @returns Promise resolving to a database instance
 */
export async function createDatabase(config: DatabaseConfig): Promise<Database> {
  try {
    switch (config.type) {
      case 'json':
        if (!config.filePath) {
          throw new DatabaseError('File path is required for JSON database')
        }
        const { JsonDatabase } = await import('../../database/json/index.js')
        return new JsonDatabase(config.filePath)

      case 'supabase':
        if (!config.connectionString) {
          throw new DatabaseError('Connection string is required for Supabase database')
        }
        const { SupabaseDatabase } = await import('../../database/supabase/index.js')
        return new SupabaseDatabase(config.connectionString)

      case 'mongodb':
        // Will be implemented later
        throw new DatabaseError('MongoDB implementation not available yet')

      default:
        throw new DatabaseError(`Unknown database type: ${config.type}`)
    }
  } catch (error) {
    if (error instanceof DatabaseError) throw error
    throw new DatabaseError(`Failed to create database: ${error instanceof Error ? error.message : String(error)}`)
  }
} 