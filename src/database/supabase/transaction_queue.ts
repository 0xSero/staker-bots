import { supabase } from './client';
import {
  TransactionQueueItem,
  TransactionQueueStatus,
} from '../interfaces/types';

const SUPABASE_NOT_CONFIGURED_ERROR = 'Supabase client is not available. Make sure SUPABASE_URL and SUPABASE_KEY are configured in your environment or config file.';

export async function createTransactionQueueItem(
  item: Omit<
    TransactionQueueItem,
    'id' | 'created_at' | 'updated_at' | 'attempts'
  >,
): Promise<TransactionQueueItem> {
  const newItem = {
    ...item,
    attempts: 0,
  };

  const client = supabase();
  if (!client) {
    throw new Error(SUPABASE_NOT_CONFIGURED_ERROR);
  }

  const { data, error } = await client
    .from('transaction_queue')
    .insert([newItem])
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function updateTransactionQueueItem(
  id: string,
  update: Partial<
    Omit<TransactionQueueItem, 'id' | 'created_at' | 'updated_at'>
  >,
): Promise<void> {
  const client = supabase();
  if (!client) {
    throw new Error(SUPABASE_NOT_CONFIGURED_ERROR);
  }

  const { error } = await client
    .from('transaction_queue')
    .update(update)
    .eq('id', id);

  if (error) throw error;
}

export async function getTransactionQueueItem(
  id: string,
): Promise<TransactionQueueItem | null> {
  const client = supabase();
  if (!client) {
    throw new Error(SUPABASE_NOT_CONFIGURED_ERROR);
  }

  const { data, error } = await client
    .from('transaction_queue')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // No rows returned
    throw error;
  }

  return data;
}

export async function getTransactionQueueItemsByStatus(
  status: TransactionQueueStatus,
): Promise<TransactionQueueItem[]> {
  const client = supabase();
  if (!client) {
    throw new Error(SUPABASE_NOT_CONFIGURED_ERROR);
  }

  const { data, error } = await client
    .from('transaction_queue')
    .select('*')
    .eq('status', status);

  if (error) throw error;
  return data || [];
}

export async function getTransactionQueueItemByDepositId(
  depositId: string,
): Promise<TransactionQueueItem | null> {
  const client = supabase();
  if (!client) {
    throw new Error(SUPABASE_NOT_CONFIGURED_ERROR);
  }

  const { data, error } = await client
    .from('transaction_queue')
    .select('*')
    .eq('deposit_id', depositId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // No rows returned
    throw error;
  }

  return data;
}

export async function getTransactionQueueItemsByHash(
  hash: string,
): Promise<TransactionQueueItem[]> {
  const client = supabase();
  if (!client) {
    throw new Error(SUPABASE_NOT_CONFIGURED_ERROR);
  }

  const { data, error } = await client
    .from('transaction_queue')
    .select('*')
    .eq('hash', hash);

  if (error) throw error;
  return data || [];
}

export async function deleteTransactionQueueItem(id: string): Promise<void> {
  const client = supabase();
  if (!client) {
    throw new Error(SUPABASE_NOT_CONFIGURED_ERROR);
  }

  const { error } = await client
    .from('transaction_queue')
    .delete()
    .eq('id', id);

  if (error) throw error;
}
