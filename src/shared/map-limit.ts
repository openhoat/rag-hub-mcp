/**
 * Run `fn` over `items` with at most `limit` concurrent invocations, preserving
 * the input order in the result. Stops scheduling new work as soon as one call
 * rejects, then rethrows that error once every started call has settled — no
 * dangling promise is left behind.
 */
export const mapLimit = async <T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> => {
  const results = new Array<R>(items.length)
  if (items.length === 0) return results

  const size = Math.max(1, Math.min(limit, items.length))
  let next = 0
  let failed = false
  let failure: unknown

  const worker = async (): Promise<void> => {
    while (!failed && next < items.length) {
      const index = next++
      try {
        results[index] = await fn(items[index], index)
      } catch (err) {
        failed = true
        failure = err
      }
    }
  }

  await Promise.all(Array.from({ length: size }, () => worker()))
  if (failed) throw failure
  return results
}
