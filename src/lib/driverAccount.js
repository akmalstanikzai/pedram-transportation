import { supabase } from './supabase'
import { branchAccountError } from './branchAccountError'

export async function driverAccountAction(body) {
  const { data, error } = await supabase.functions.invoke('create-driver-account', { body })
  if (error || data?.error) {
    const failure = await branchAccountError(data, error, 'driver')
    if ((body.action && failure.message === 'REQUEST_CONFLICT') ||
      (body.action === 'vault' && failure.message === 'REQUIRED_FIELDS')) throw new Error('DRIVER_FUNCTION_UPDATE_REQUIRED')
    throw failure
  }
  if (body.action === 'password' && data?.success === true && data?.vault_saved !== true) throw new Error('DRIVER_RESET_WITH_OLD_FUNCTION')
  if ((body.action === 'details' && typeof data?.login !== 'string') ||
    (body.action === 'vault' && typeof data?.password !== 'string') ||
    (body.action === 'password' && data?.success !== true)) throw new Error('DRIVER_FUNCTION_UPDATE_REQUIRED')
  return data
}
