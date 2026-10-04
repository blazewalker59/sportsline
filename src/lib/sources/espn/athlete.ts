/**
 * An ESPN athlete's overview (NFL, college football, NBA): season stats,
 * recent games, next game, news and Rotowire's note. Read from
 * site.web.api.espn.com, which answers Workers (site.api.espn.com may not).
 */

import type { PlayerOverview } from '@/lib/model/types'

interface Overview {
  statistics?: {
    displayName?: string
    categories?: Array<{ displayName?: string; count?: number }>
    labels?: Array<string>
    splits?: Array<{ displayName?: string; stats?: Array<string> }>
  }
  news?: Array<{
    headline?: string
    published?: string
    lastModified?: string
    links?: { web?: { href?: string } }
  }>
  nextGame?: {
    league?: {
      events?: Array<{
        date?: string
        competitors?: Array<{
          id?: string
          homeAway?: string
          abbreviation?: string
        }>
      }>
    }
  }
  gameLog?: {
    statistics?: Array<{
      labels?: Array<string>
      events?: Array<{ eventId: string; stats?: Array<string> }>
    }>
    events?: Record<
      string,
      {
        gameDate?: string
        atVs?: string
        score?: string
        gameResult?: string
        opponent?: { abbreviation?: string }
      }
    >
  }
  rotowire?: { headline?: string; story?: string }
  fantasy?: { positionRank?: string; percentOwned?: string }
}

const RECENT = 5
const NEWS = 5

export async function espnAthleteOverview(
  sportPath: string,
  athleteId: string,
  teamSourceId: string | null,
  getJson: <T>(url: string) => Promise<T>,
): Promise<PlayerOverview | null> {
  const d = await getJson<Overview>(
    `https://site.web.api.espn.com/apis/common/v3/sports/${sportPath}/athletes/${encodeURIComponent(athleteId)}/overview`,
  )
  const st = d.statistics
  const split =
    st?.splits?.find((s) => s.displayName === 'Regular Season') ??
    st?.splits?.[0]
  // Categories (Passing 10, Rushing 5) run in order along the labels.
  const groups = (st?.categories ?? []).flatMap((c) =>
    Array<string>(c.count ?? 0).fill(c.displayName ?? ''),
  )
  const mixed = new Set(groups).size > 1
  const season =
    st?.labels && split?.stats
      ? {
          title: mixed
            ? `${/^\d{4}/.exec(st.displayName ?? '')?.[0] ?? ''} Season`.trim()
            : (st.displayName ?? 'Season'),
          stats: st.labels.map((label, i) => ({
            label,
            value: split.stats?.[i] ?? '—',
            ...(mixed && groups[i] ? { group: groups[i] } : {}),
          })),
        }
      : null

  const log = d.gameLog
  const lines = log?.statistics?.[0]
  const recent = (lines?.events ?? []).slice(0, RECENT).map((e) => {
    const g = log?.events?.[e.eventId]
    return {
      date: g?.gameDate ?? '',
      opponent: g?.opponent?.abbreviation ?? '',
      home: g?.atVs === 'vs',
      result: g?.gameResult ?? null,
      score: g?.score ?? null,
      // Counts only: rates and longs crowd a one-line summary.
      line: (lines?.labels ?? [])
        .flatMap((label, i) =>
          /%|AVG|LNG|LONG|RTG|QBR/.test(label)
            ? []
            : [`${e.stats?.[i] ?? '—'} ${label}`],
        )
        .slice(0, 5)
        .join(' · '),
    }
  })

  const ev = d.nextGame?.league?.events?.[0]
  const mine = ev?.competitors?.find((c) => c.id === teamSourceId)
  const other = ev?.competitors?.find((c) => c !== mine)
  const next =
    ev?.date && other
      ? {
          date: ev.date,
          opponent: other.abbreviation ?? '',
          home: mine ? mine.homeAway === 'home' : other.homeAway === 'away',
        }
      : null

  return {
    season,
    recent,
    next,
    news: (d.news ?? []).slice(0, NEWS).flatMap((n) =>
      n.headline
        ? [
            {
              headline: n.headline,
              published: n.published ?? n.lastModified ?? null,
              url: n.links?.web?.href ?? null,
            },
          ]
        : [],
    ),
    note: d.rotowire?.headline
      ? { headline: d.rotowire.headline, story: d.rotowire.story ?? null }
      : null,
    fantasy:
      d.fantasy?.positionRank || d.fantasy?.percentOwned
        ? [
            d.fantasy.positionRank && `#${d.fantasy.positionRank} at position`,
            d.fantasy.percentOwned &&
              `${Math.round(Number(d.fantasy.percentOwned))}% owned`,
          ]
            .filter(Boolean)
            .join(' · ')
        : null,
  }
}
