import { supabase } from './supabase'
import { branchAccountError } from './branchAccountError'

export async function traderAccountAction(body) {
  const { data, error } = await supabase.functions.invoke('manage-trader-account', { body })
  if (error || data?.error) throw await branchAccountError(data, error, 'trader')
  if (body.action === 'password' && data?.success === true && data?.vault_saved !== true) {
    throw new Error('TRADER_RESET_WITH_OLD_FUNCTION')
  }
  if ((body.action === 'details' && (typeof data?.login !== 'string' || typeof data?.enabled !== 'boolean')) ||
      (body.action === 'vault' && (data?.verified !== true || typeof data?.password !== 'string')) ||
      (body.action === 'password' && data?.success !== true) ||
      (body.action === 'create' && (typeof data?.user_id !== 'string' || typeof data?.login !== 'string'))) {
    throw new Error('TRADER_FUNCTION_UPDATE_REQUIRED')
  }
  return data
}
