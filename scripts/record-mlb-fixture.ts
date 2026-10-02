/**
 * Record a real MLB StatsAPI live feed as a test fixture.
 *
 *   bun run fixtures:mlb <gamePk> [name]
 *
 * Writes src/__tests__/fixtures/mlb/<name or gamePk>.json. Recorded Source
 * responses are how the adapter and diffing are tested (live games are the
 * only other way to see real Source behaviour).
 */

const [gamePk, name] = process.argv.slice(2)
if (!gamePk || !/^\d+$/.test(gamePk)) {
  console.error('usage: bun run fixtures:mlb <gamePk> [name]')
  process.exit(1)
}
const res = await fetch(
  `https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`,
)
if (!res.ok) throw new Error(`StatsAPI ${res.status}`)
const out = `src/__tests__/fixtures/mlb/${name ?? gamePk}.json`
await Bun.write(out, await res.text())
console.log(`wrote ${out}`)
