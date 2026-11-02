// A tiny in-memory stand-in for the Supabase query builder.
// It records every call so tests can assert on table names, filters and payloads.
// It never touches the network.

export type Call = { method: string; args: unknown[] }
export type Query = { table: string; calls: Call[] }
export type Result = { data: unknown; error: { message: string } | null }

export function createFakeSupabase(respond: (q: Query) => Result = () => ({ data: [], error: null })) {
  const queries: Query[] = []

  function from(table: string) {
    const query: Query = { table, calls: [] }
    queries.push(query)
    const builder: Record<string, unknown> = {}
    for (const method of ['select', 'insert', 'update', 'eq', 'order', 'single', 'limit']) {
      builder[method] = (...args: unknown[]) => {
        query.calls.push({ method, args })
        return builder
      }
    }
    builder.then = (onOk: (r: Result) => unknown, onErr?: (e: unknown) => unknown) =>
      Promise.resolve(respond(query)).then(onOk, onErr)
    return builder
  }

  return { client: { from }, queries }
}

export function callsOf(q: Query, method: string) {
  return q.calls.filter((c) => c.method === method).map((c) => c.args)
}
