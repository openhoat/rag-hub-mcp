import { describe, expect, test } from 'vitest'
import { mapLimit } from './map-limit.js'

const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

describe('mapLimit', () => {
  test('should return an empty array for no items', async () => {
    expect(await mapLimit([], 4, async () => 0)).toEqual([])
  })

  test('should preserve the input order in the result', async () => {
    const result = await mapLimit([3, 1, 2], 2, async n => {
      await tick()
      return n * 2
    })
    expect(result).toEqual([6, 2, 4])
  })

  test('should never exceed the concurrency limit', async () => {
    let active = 0
    let maxActive = 0
    const items = Array.from({ length: 10 }, (_, i) => i)
    await mapLimit(items, 3, async () => {
      active++
      maxActive = Math.max(maxActive, active)
      await tick()
      active--
      return 0
    })
    expect(maxActive).toBe(3)
  })

  test('should run every item when there are fewer items than the limit', async () => {
    const seen: number[] = []
    await mapLimit([1, 2], 8, async n => {
      seen.push(n)
    })
    expect(seen.sort()).toEqual([1, 2])
  })

  test('should reject with the first error and stop scheduling new work', async () => {
    let started = 0
    await expect(
      mapLimit([1, 2, 3, 4], 2, async n => {
        started++
        if (n === 1) throw new Error('boom')
        await tick()
        return n
      }),
    ).rejects.toThrow('boom')
    // The two workers each start one item before the failure is observed, so at
    // most three items are ever scheduled — the remaining ones are not started.
    expect(started).toBeLessThanOrEqual(3)
    expect(started).toBeGreaterThan(0)
  })
})
