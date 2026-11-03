export async function branchAccountError(data, error) {
  let message = data?.error || error?.message || 'ACCOUNT_UPDATE_FAILED'
  const status = error?.context?.status
  try {
    const body = await error.context.json()
    message = body.error || body.message || message
  } catch { /* CORS/network failures have no response body available to the browser. */ }
  if (status === 404) message = 'BRANCH_FUNCTION_MISSING'
  else if (error?.name === 'FunctionsFetchError' || error?.name === 'FunctionsRelayError') message = 'BRANCH_FUNCTION_UNREACHABLE'
  else if (status === 401) message = 'BRANCH_SESSION_INVALID'
  return new Error(message)
}
