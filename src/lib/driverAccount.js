import { supabase } from './supabase'
import { branchAccountError } from './branchAccountError'

export async function driverAccountAction(body) {
  const { data, error } = await supabase.functions.invoke('create-driver-account', { body })
  if (error || data?.error) {
    const failure = await branchAccountError(data, error, 'driver')
    if (body.action && failure.message === 'REQUEST_CONFLICT') throw new Error('DRIVER_FUNCTION_UPDATE_REQUIRED')
    throw failure
  }
  if ((body.action === 'details' && typeof data?.login !== 'string') || (body.action === 'password' && data?.success !== true)) throw new Error('DRIVER_FUNCTION_UPDATE_REQUIRED')
  return data
}
