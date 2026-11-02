// Talks to the aquila-ask Edge Function and reads past answers.
// The Gemini key lives only in the function; nothing here knows about it.

import { supabase } from '../../../lib/supabase'
import type { Suggestion } from '../types'
import { parseAskResponse, type AskRequest, type AskResponse } from './askMapping'

export const ASK_FUNCTION = 'aquila-ask'
const SUGGESTIONS = 'mt_suggestions'

/** Pulls the function's own { error } message out of a failed call, when there is one. */
async function functionErrorMessage(error: unknown): Promise<string> {
  const context = (error as { context?: unknown } | null)?.context
  if (context instanceof Response) {
    try {
      const body = (await context.clone().json()) as { error?: unknown }
      if (typeof body.error === 'string' && body.error) return body.error
    } catch {
      // Not JSON: fall through to the generic message.
    }
  }
  return (error as Error | null)?.message || 'Ask AI could not be reached.'
}

/** Sends the question to the function, which uses the signed-in user's login. */
export async function askQuestion(request: AskRequest): Promise<AskResponse> {
  const { data, error } = await supabase.functions.invoke(ASK_FUNCTION, { body: request })
  if (error) throw new Error(await functionErrorMessage(error))
  return parseAskResponse(data)
}

/** Past answers, newest first. */
export async function fetchSuggestions(limit = 20): Promise<Suggestion[]> {
  const { data, error } = await supabase
    .from(SUGGESTIONS)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data as Suggestion[] | null) ?? []
}
