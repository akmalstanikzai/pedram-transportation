import { supabase } from './supabase'
export function client() {
  if (!supabase) throw new Error('CONFIGURATION')
  return supabase
}
export async function rpc(name, params) {
  const { data, error } = await client().rpc(name, params)
  if (error) throw error
  return data
}
export async function invoke(name, body) {
  const { data, error } = await client().functions.invoke(name, { body })
  if (error) {
    let code = ''
    try {
      code = (await error.context?.json())?.error || ''
    } catch {
      /* A network failure may not have a JSON response. */
    }
    throw new Error(code || error.message)
  }
  if (data?.error) throw new Error(data.error)
  return data
}
export async function rows(table, selection = '*', configure = (query) => query) {
  const result = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await configure(
      client().from(table).select(selection).order('id'),
    ).range(offset, offset + 499)
    if (error) throw error
    result.push(...(data || []))
    if (!data || data.length < 500) return result
  }
}
