/**
 * The front door: Sportsline is for signed-in Viewers, so a visitor sees
 * this and nothing else. A product page on a night-game stage (team-color
 * glow over yard lines): the headline and one way in, then the app itself
 * on a desktop with a phone beside it, both drawn with the app's own parts
 * (the tab's hero, the board's tiles, the narrowed strip, a feed tagged
 * with what each play did for you) so it can't drift from what you get.
 * Then the four tabs, in the navigation's order and colors, and three
 * steps to get going. Motion stops for reduced-motion settings.
 *
 * Only live and final Games are shown: a start time reads in the
 * visitor's zone, which the server rendering this doesn't know.
 */

import type { GameSummary } from '@/lib/model/timeline'
import type { ScopePage } from '@/components/timeline/scopePages'
import type { GameStake } from '@/lib/timeline/stakes'
import type { IconName } from '@/components/layout/NavIcon'
import { signIn } from '@/lib/auth/client'
import {
  LiveBoard,
  NarrowedBar,
  ScopeHero,
  TabHero,
} from '@/components/timeline/LiveBoard'
import { NavGlyph } from '@/components/layout/NavIcon'
import { TeamLogo } from '@/components/brand/TeamMark'
import { cn } from '@/lib/utils'

const logo = (league: string, abbr: string) =>
  `https://a.espncdn.com/combiner/i?img=/i/teamlogos/${league}/500/${abbr}.png&w=80&h=80`

const team = (league: string, abbreviation: string, name: string) => ({
  id: `${league}-${abbreviation}`,
  abbreviation,
  name,
  logoUrl: logo(league, abbreviation.toLowerCase()),
})

const game = (
  id: string,
  league: GameSummary['league'],
  away: ReturnType<typeof team>,
  home: ReturnType<typeof team>,
  score: [number, number],
  segment: string | null,
): GameSummary => ({
  id,
  league,
  sportsDay: '2026-11-24',
  status: segment ? 'live' : 'final',
  startsAt: '2026-11-24T23:00:00Z',
  awayTeam: away,
  homeTeam: home,
  score: { away: score[0], home: score[1] },
  situation: segment ? { segmentLabel: segment, detail: {} } : null,
})

/** A night of Games, as the board shows them. */
const GAMES: ReadonlyArray<GameSummary> = [
  game(
    'kc',
    'nfl',
    team('nfl', 'BUF', 'Bills'),
    team('nfl', 'KC', 'Chiefs'),
    [20, 24],
    'Q4 1:42',
  ),
  game(
    'bos',
    'nba',
    team('nba', 'NY', 'Knicks'),
    team('nba', 'BOS', 'Celtics'),
    [101, 104],
    'Q4 0:38',
  ),
  game(
    'edm',
    'nhl',
    team('nhl', 'VAN', 'Canucks'),
    team('nhl', 'EDM', 'Oilers'),
    [2, 3],
    '3rd 4:12',
  ),
  game(
    'lad',
    'mlb',
    team('mlb', 'SD', 'Padres'),
    team('mlb', 'LAD', 'Dodgers'),
    [3, 5],
    'Bot 8th',
  ),
  game(
    'det',
    'nba',
    team('nba', 'CHI', 'Bulls'),
    team('nba', 'DET', 'Pistons'),
    [104, 112],
    null,
  ),
]
const PAGES: Array<Extract<ScopePage, { kind: 'game' }>> = GAMES.map((g) => ({
  kind: 'game',
  id: g.id,
  game: g,
}))
const STAKES: Record<string, Array<GameStake>> = {
  kc: ['following', 'fantasy'],
  bos: ['prediction'],
  edm: ['following'],
}
const stakesOf = (g: GameSummary) => STAKES[g.id] ?? []

interface Moment {
  team: string
  logo: string
  text: string
  scoring?: boolean
  ago: string
  tags?: Array<{ tone: 'fantasy' | 'prediction'; text: string }>
}

/** The feed, as the app draws it: bubbles, scoring outlined, tagged. */
const MOMENTS: ReadonlyArray<Moment> = [
  {
    team: 'Chiefs',
    logo: logo('nfl', 'kc'),
    text: 'Mahomes to Kelce for 18 yards. Touchdown, Chiefs lead 24–20.',
    scoring: true,
    ago: '8s',
    tags: [{ tone: 'fantasy', text: '★ Your starter · Kelce' }],
  },
  {
    team: 'Celtics',
    logo: logo('nba', 'bos'),
    text: 'Tatum step-back three. Celtics by 3 with 38 seconds left.',
    scoring: true,
    ago: '40s',
    tags: [{ tone: 'prediction', text: 'Celtics to win · 81%' }],
  },
  {
    team: 'Oilers',
    logo: logo('nhl', 'edm'),
    text: 'McDavid from Draisaitl on the power play. 3–2 Oilers.',
    scoring: true,
    ago: '2m',
  },
  {
    team: 'Dodgers',
    logo: logo('mlb', 'lad'),
    text: 'Ohtani homers, 431 feet to right. Dodgers up 5–3.',
    scoring: true,
    ago: '4m',
  },
]

const TICKER = [
  'BUF 20 · KC 24 · Q4',
  'NY 101 · BOS 104 · Q4',
  'VAN 2 · EDM 3 · 3rd',
  'SD 3 · LAD 5 · B8',
  'CHI 104 · DET 112 · Final',
  'PHI 17 · DAL 13 · Q3',
  'NYY 2 · HOU 2 · T6',
  'DEN 88 · MIN 90 · Q4',
]

/** The four tabs, in the navigation's order and colors. */
const TABS: ReadonlyArray<{
  icon: IconName
  label: string
  tone: string
  figure: string
  text: string
}> = [
  {
    icon: 'follows',
    label: 'Following',
    tone: 'var(--accent)',
    figure: '2 live',
    text: 'Every play from your teams and players, as it happens.',
  },
  {
    icon: 'all',
    label: 'All',
    tone: 'var(--accent)',
    figure: '5 games',
    text: 'Every league you watch, live, with the scores on top.',
  },
  {
    icon: 'predictions',
    label: 'Predictions',
    tone: 'var(--section-predictions)',
    figure: '$37.80',
    text: 'Your Kalshi odds moving with the game, leg by leg.',
  },
  {
    icon: 'fantasy',
    label: 'Fantasy',
    tone: 'var(--section-fantasy)',
    figure: '88.4–71.2',
    text: 'ESPN and Sleeper matchups, starter by starter.',
  },
]

const STEPS = [
  {
    title: 'Sign in with Google',
    text: 'One tap. No password to make up.',
  },
  {
    title: 'Follow and connect',
    text: 'Pick your teams and players. Connect Kalshi, ESPN or Sleeper if you play.',
  },
  {
    title: 'Watch it live',
    text: 'Every play lands as it happens, tagged with what it means for you.',
  },
]

const signInWithGoogle = () =>
  void signIn.social({ provider: 'google', callbackURL: '/' })

export function Landing() {
  return (
    // Always the app's dark theme, whatever the device's: the stage is night.
    <div className="landing dark relative isolate flex min-h-dvh flex-col overflow-hidden bg-[#07080c] text-white">
      {/* The stage: team-color glow drifting over yard lines. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
      >
        <span className="landing-glow top-[-10%] left-[-20%] bg-[#E31837]" />
        <span className="landing-glow landing-glow-2 top-[20%] right-[-25%] bg-[#005A9C]" />
        <span className="landing-glow landing-glow-3 bottom-[-20%] left-[10%] bg-[#007A33]" />
        <span className="landing-field absolute inset-0" />
        <span className="absolute inset-0 bg-gradient-to-b from-transparent via-[#07080c]/40 to-[#07080c]" />
      </div>

      <header className="mx-auto flex w-full max-w-6xl items-center gap-2 px-5 pt-[max(env(safe-area-inset-top),1.25rem)]">
        <img src="/favicon.svg" alt="" width={28} height={28} />
        <span className="text-lg font-bold tracking-tight">Sportsline</span>
        <span className="ml-1 flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-3xs font-bold tracking-wider uppercase">
          <span className="landing-live size-1.5 rounded-full bg-[#ff5a4e]" />
          Live
        </span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={signInWithGoogle}
          className="landing-cta hidden min-h-10 items-center gap-2 rounded-full bg-white px-4 text-[13px] font-semibold text-[#111318] transition-transform active:scale-[0.98] sm:flex"
        >
          <GoogleMark />
          Sign in
        </button>
      </header>

      <main className="flex flex-1 flex-col">
        <section className="landing-rise mx-auto flex w-full max-w-3xl flex-col items-center gap-5 px-5 pt-10 text-center md:pt-14">
          <h1 className="text-[2.6rem] leading-[1.02] font-extrabold tracking-tight md:text-6xl">
            Every play that matters to you,{' '}
            <span className="landing-ink bg-gradient-to-r from-[#ffb612] via-[#ff5a4e] to-[#8fbce6] bg-clip-text text-transparent">
              live.
            </span>
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-white/70 md:text-lg">
            Your teams, your predictions and your fantasy matchups in one live
            feed, on your phone and your desktop.
          </p>
          <div className="flex flex-col items-center gap-2">
            <CallToAction />
            <span className="text-xs text-white/50">
              Sign in to start. Your connected accounts stay yours.
            </span>
          </div>
        </section>

        {/* The app itself, drawn with its own parts, in its dark theme. */}
        <section
          aria-hidden="true"
          inert
          className="landing-rise relative mx-auto mt-10 w-full max-w-5xl px-5 md:mt-14"
          style={{ animationDelay: '0.15s' }}
        >
          {/* The phone stands off the window's corner, clear of its pane. */}
          <div className="hidden md:block md:pr-40 lg:pr-48">
            <Desktop />
          </div>
          <div className="mx-auto w-full max-w-[320px] md:absolute md:right-5 md:-bottom-12 md:w-[300px]">
            <Phone />
          </div>
        </section>

        <section
          aria-labelledby="landing-tabs"
          className="mx-auto w-full max-w-6xl px-5 pt-16 md:pt-24"
        >
          <h2
            id="landing-tabs"
            className="text-2xl font-bold tracking-tight md:text-3xl"
          >
            Four ways to watch
          </h2>
          <p className="mt-1 text-[15px] text-white/60">
            The same four tabs, in the same order, on every screen.
          </p>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {TABS.map((t, i) => (
              <li
                key={t.label}
                className="landing-rise flex flex-col gap-2 rounded-sheet border border-[color-mix(in_srgb,var(--tone)_35%,rgb(255_255_255/0.08))] bg-[linear-gradient(160deg,color-mix(in_srgb,var(--tone)_18%,#0f1117),#0f1117_70%)] p-4"
                style={
                  {
                    '--tone': t.tone,
                    animationDelay: `${0.2 + i * 0.08}s`,
                  } as React.CSSProperties
                }
              >
                <span className="flex items-center gap-1.5 text-3xs font-bold tracking-wide text-(--tone) uppercase">
                  <NavGlyph name={t.icon} className="size-4" />
                  {t.label}
                </span>
                <span className="text-2xl font-extrabold tracking-tight tabular-nums">
                  {t.figure}
                </span>
                <p className="text-[13px] leading-snug text-white/60">
                  {t.text}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section
          aria-labelledby="landing-steps"
          className="mx-auto w-full max-w-6xl px-5 pt-16 pb-14 md:pt-20"
        >
          <h2
            id="landing-steps"
            className="text-2xl font-bold tracking-tight md:text-3xl"
          >
            Set up in a minute
          </h2>
          <p className="mt-1 text-[15px] text-white/60">
            Everything’s optional: start with your teams.
          </p>
          <ol className="mt-5 grid gap-3 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li
                key={s.title}
                className="rounded-sheet border border-white/10 bg-white/[0.04] p-4"
              >
                <span className="mb-2 flex size-6 items-center justify-center rounded-full bg-white/10 text-xs font-bold">
                  {i + 1}
                </span>
                <p className="text-[15px] font-bold">{s.title}</p>
                <p className="mt-0.5 text-[13px] leading-snug text-white/60">
                  {s.text}
                </p>
              </li>
            ))}
          </ol>
          <div className="mt-8 flex justify-center">
            <CallToAction />
          </div>
        </section>
      </main>

      <footer
        aria-hidden="true"
        className="relative border-t border-white/10 bg-black/30 py-2.5 pb-[max(env(safe-area-inset-bottom),0.625rem)]"
      >
        <div className="landing-ticker flex w-max gap-8 text-[12px] font-semibold tracking-wide whitespace-nowrap text-white/70 tabular-nums">
          {[...TICKER, ...TICKER].map((t, i) => (
            <span key={i} className="flex items-center gap-2">
              <span className="size-1 rounded-full bg-white/30" />
              {t}
            </span>
          ))}
        </div>
      </footer>
    </div>
  )
}

function CallToAction() {
  return (
    <button
      type="button"
      onClick={signInWithGoogle}
      className="landing-cta flex min-h-12 items-center gap-3 rounded-full bg-white px-6 text-[15px] font-semibold text-[#111318] shadow-[0_8px_30px_rgba(255,255,255,0.15)] transition-transform active:scale-[0.98]"
    >
      <GoogleMark />
      Continue with Google
    </button>
  )
}

const noop = () => {}

/** The All tab's hero, its League row drawn as the app draws it. */
function AllHero() {
  return (
    <TabHero
      icon="all"
      tone="var(--accent)"
      kicker="All Leagues"
      figure="4 live"
      aside="5 games"
    >
      <span className="flex w-max gap-0.5 rounded-full bg-notice p-0.5 text-xs font-semibold">
        {['All leagues', 'NFL', 'NBA', 'NHL', 'MLB'].map((l, i) => (
          <span
            key={l}
            className={cn(
              'flex h-7 items-center rounded-full px-3',
              i === 0 ? 'bg-surface text-foreground shadow-sm' : 'text-muted',
            )}
          >
            {l}
          </span>
        ))}
      </span>
    </TabHero>
  )
}

function Feed({ moments }: { moments: ReadonlyArray<Moment> }) {
  return (
    <ol className="flex flex-col gap-3">
      {moments.map((m) => (
        <li key={m.text} className="flex items-end gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-bubble-border bg-surface">
            <img src={m.logo} alt="" width={20} height={20} />
          </span>
          <span className="flex min-w-0 flex-col items-start gap-1">
            <span className="px-1 text-3xs font-semibold text-muted">
              {m.team}
            </span>
            <span
              className={cn(
                'rounded-sheet bg-bubble px-3 py-2 text-[13px] leading-snug',
                m.scoring
                  ? 'border-2 border-scoring'
                  : 'border border-bubble-border',
              )}
            >
              {m.scoring && (
                <span className="block text-[9px] font-bold tracking-widest text-scoring">
                  SCORING
                </span>
              )}
              {m.text}
              <span className="ml-1.5 text-3xs text-muted">{m.ago}</span>
            </span>
            {m.tags && (
              <span className="flex flex-wrap gap-1 px-1 text-3xs font-semibold">
                {m.tags.map((t) => (
                  <span
                    key={t.text}
                    className={cn(
                      'rounded-full px-2 py-0.5',
                      t.tone === 'fantasy'
                        ? 'bg-scoring/15 text-scoring'
                        : 'bg-positive/15 text-positive',
                    )}
                  >
                    {t.text}
                  </span>
                ))}
              </span>
            )}
          </span>
        </li>
      ))}
    </ol>
  )
}

const RAIL: ReadonlyArray<{ icon: IconName; label: string; on?: boolean }> = [
  { icon: 'follows', label: 'Following' },
  { icon: 'all', label: 'All', on: true },
  { icon: 'predictions', label: 'Predictions' },
  { icon: 'fantasy', label: 'Fantasy' },
]

/** The desktop app: rail, the home board over the feed, and the pane. */
function Desktop() {
  const chosen = GAMES[0]
  return (
    <div className="overflow-hidden rounded-card border border-white/15 bg-background text-foreground shadow-[0_40px_100px_rgba(0,0,0,0.6)]">
      <div className="flex h-8 items-center gap-1.5 bg-[#1b1e26] px-3">
        {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
          <span
            key={c}
            className="size-2.5 rounded-full"
            style={{ background: c }}
          />
        ))}
      </div>
      <div className="grid h-[580px] grid-cols-[150px_1fr_1fr] gap-5 overflow-hidden pr-5">
        <nav className="glass-nav m-3 flex flex-col gap-1 rounded-sheet p-2">
          <span className="flex items-center gap-2 px-2 pt-1 pb-3 text-sm font-bold">
            <img src="/favicon.svg" alt="" width={18} height={18} />
            Sportsline
          </span>
          {RAIL.map((r) => (
            <span
              key={r.label}
              className={cn(
                'flex items-center gap-2 rounded-card px-2.5 py-2 text-xs font-semibold text-glass-ink-muted',
                r.on && 'bg-surface/60 text-accent',
              )}
            >
              <NavGlyph name={r.icon} />
              {r.label}
            </span>
          ))}
        </nav>
        <div className="flex min-w-0 flex-col pt-4">
          <span className="mb-3 text-base font-bold">Today</span>
          <AllHero />
          <LiveBoard
            pages={PAGES}
            current={`game:${chosen.id}`}
            stakesOf={stakesOf}
            layout="grid"
            onLayout={noop}
            onPick={noop}
            opensOnPick
          />
          <NarrowedBar page={PAGES[0]} onClear={noop} />
          <Feed moments={MOMENTS.slice(0, 1)} />
        </div>
        <div className="flex min-w-0 flex-col gap-3 border-l border-border pt-4 pl-5">
          <Scoreboard game={chosen} />
          <table className="w-full overflow-hidden rounded-card bg-surface text-xs tabular-nums">
            <thead className="text-3xs text-muted uppercase">
              <tr>
                {['Chiefs', 'C/ATT', 'YDS', 'TD'].map((h) => (
                  <th key={h} className="px-3 py-2 text-right first:text-left">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ['Patrick Mahomes', '24/33', '281', '3'],
                ['Travis Kelce', '9 rec', '104', '1'],
                ['Isiah Pacheco', '17 car', '86', '0'],
              ].map((row) => (
                <tr key={row[0]} className="border-t border-border">
                  {row.map((c, i) => (
                    <td
                      key={i}
                      className="px-3 py-2 text-right first:text-left"
                    >
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <span className="text-3xs font-bold tracking-wide text-muted uppercase">
            This game’s plays
          </span>
          <Feed moments={MOMENTS.slice(0, 1)} />
        </div>
      </div>
    </div>
  )
}

/** A Game's scoreboard, as the pane opens it. */
function Scoreboard({ game: g }: { game: GameSummary }) {
  return (
    <div
      className="grid grid-cols-[1fr_auto_1fr] items-center rounded-sheet border border-border p-3"
      style={{
        background:
          'linear-gradient(90deg, color-mix(in srgb, #00338D 30%, var(--surface)), var(--surface) 45%, var(--surface) 55%, color-mix(in srgb, #E31837 30%, var(--surface)))',
      }}
    >
      <span className="flex items-center gap-2 text-2xl font-bold tabular-nums">
        <TeamLogo team={g.awayTeam} size={30} />
        {g.score.away}
      </span>
      <span className="text-center text-3xs font-semibold text-live">
        {g.situation?.segmentLabel}
      </span>
      <span className="flex items-center justify-end gap-2 text-2xl font-bold tabular-nums">
        {g.score.home}
        <TeamLogo team={g.homeTeam} size={30} />
      </span>
    </div>
  )
}

const TAB_BAR: ReadonlyArray<{ icon: IconName; label: string }> = [
  { icon: 'follows', label: 'Following' },
  { icon: 'all', label: 'All' },
  { icon: 'predictions', label: 'Predictions' },
  { icon: 'fantasy', label: 'Fantasy' },
]

/** The phone app: the Fantasy tab's hero, its Games, and the tab bar. */
function Phone() {
  return (
    <div className="relative rounded-[2.4rem] border border-white/15 bg-[#0e1015] p-2.5 shadow-[0_30px_80px_rgba(0,0,0,0.6)]">
      <div className="relative h-[520px] overflow-hidden rounded-[1.9rem] bg-background px-3 pt-8 text-foreground">
        <ScopeHero
          tab="fantasy"
          headline={{
            kicker: 'Fantasy',
            figure: '88.4–71.2',
            aside: 'leading GG',
            line: 'The League',
          }}
        />
        <LiveBoard
          pages={PAGES.slice(0, 2)}
          current="all"
          stakesOf={stakesOf}
          layout="grid"
          onLayout={noop}
          onPick={noop}
        />
        <Feed moments={MOMENTS.slice(0, 2)} />
        <div className="glass-nav absolute inset-x-3 bottom-3 flex rounded-full p-1">
          {TAB_BAR.map((t) => (
            <span
              key={t.label}
              className={cn(
                'flex flex-1 flex-col items-center gap-0.5 rounded-full py-1 text-[9px] font-semibold text-glass-ink-muted',
                t.icon === 'fantasy' && 'bg-surface/60 text-section-fantasy',
              )}
            >
              <NavGlyph name={t.icon} />
              {t.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  )
}
