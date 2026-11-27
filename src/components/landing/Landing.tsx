/**
 * The front door: Sportsline is for signed-in Viewers, so a visitor sees
 * this and nothing else. Signal's product page: aluminum and ink in the
 * visitor's own theme, the headline closing on the one orange point, and
 * one key in (Continue with Google). Then the product as objects, sitting
 * in a recessed tray like a spec sheet: a phone on the Timeline (the home
 * board's score in dots over its win-chance meter, the board's own tiles,
 * the feed tagged with what each play did for you, the dock) and the
 * imagined Sportsline device beside it (a dot display, scope keys, stake
 * lights). Then the four tabs, in the navigation's order, and three steps.
 * Motion stops for reduced-motion settings.
 *
 * Only live and final Games are shown: a start time reads in the
 * visitor's zone, which the server rendering this doesn't know.
 */

import type { GameSummary } from '@/lib/model/timeline'
import type { ScopePage } from '@/components/timeline/scopePages'
import type { GameStake } from '@/lib/timeline/stakes'
import type { IconName } from '@/components/layout/NavIcon'
import { signIn } from '@/lib/auth/client'
import { LiveBoard } from '@/components/timeline/LiveBoard'
import { NavGlyph } from '@/components/layout/NavIcon'
import { ThemeButton } from '@/components/layout/ThemeButton'
import { Mark, Wordmark } from '@/components/signal/Logo'
import { Meter } from '@/components/signal/Meter'
import { Num } from '@/components/signal/Num'
import { SectionLabel } from '@/components/signal/Section'
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
    'den',
    'nfl',
    team('nfl', 'KC', 'Chiefs'),
    team('nfl', 'DEN', 'Broncos'),
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
  den: ['following', 'fantasy'],
  bos: ['prediction'],
  edm: ['following'],
}
const stakesOf = (g: GameSummary) => STAKES[g.id] ?? []

interface Moment {
  game: string
  text: string
  /** A Scoring Play: the orange glyph. */
  scoring?: boolean
  ago: string
  /** What it did for the Viewer: orange, with a dot. */
  stake?: string
}

/** The feed, as the app draws it: numbered, glyphed, tagged. */
const MOMENTS: ReadonlyArray<Moment> = [
  {
    game: 'KC @ DEN',
    text: 'Nix to Waddle for 18 yards. Touchdown, Broncos lead 24–20.',
    scoring: true,
    ago: '8s',
    stake: 'Your starter · Waddle +10.8',
  },
  {
    game: 'NY @ BOS',
    text: 'Tatum step-back three. Celtics by 3 with 38 seconds left.',
    scoring: true,
    ago: '40s',
    stake: 'Celtics to win · 81%',
  },
  {
    game: 'VAN @ EDM',
    text: 'McDavid from Draisaitl on the power play. 3–2 Oilers.',
    scoring: true,
    ago: '2m',
  },
  {
    game: 'SD @ LAD',
    text: 'Ohtani homers, 431 feet to right. Dodgers up 5–3.',
    scoring: true,
    ago: '4m',
  },
]

const TICKER = [
  'KC 20 · DEN 24 · Q4',
  'NY 101 · BOS 104 · Q4',
  'VAN 2 · EDM 3 · 3rd',
  'SD 3 · LAD 5 · B8',
  'CHI 104 · DET 112 · Final',
  'PHI 17 · DAL 13 · Q3',
  'NYY 2 · HOU 2 · T6',
  'DEN 88 · MIN 90 · Q4',
]

/** The four tabs, in the navigation's order. */
const TABS: ReadonlyArray<{
  icon: IconName
  label: string
  figure: string
  live?: boolean
  text: string
}> = [
  {
    icon: 'follows',
    label: 'Following',
    figure: '2 live',
    live: true,
    text: 'Every play from your teams and players, as it happens.',
  },
  {
    icon: 'all',
    label: 'All',
    figure: '5 games',
    text: 'Every league you watch, live, with the scores on top.',
  },
  {
    icon: 'predictions',
    label: 'Predictions',
    figure: '$37.80',
    text: 'Your Kalshi odds moving with the game, leg by leg.',
  },
  {
    icon: 'fantasy',
    label: 'Fantasy',
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

/** A key's cap, in the label face (styles.css `.key`). */
const KEY =
  'key inline-flex items-center justify-center gap-2 rounded-control font-bold uppercase'

export function Landing() {
  return (
    <div className="landing flex min-h-dvh flex-col bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-6xl items-center gap-3 px-5 pt-[max(env(safe-area-inset-top),1.25rem)]">
        <span className="text-[1.375rem]">
          <span className="sr-only">Sportsline</span>
          <Wordmark aria-hidden />
        </span>
        <span className="flex-1" />
        <ThemeButton />
        <button
          type="button"
          onClick={signInWithGoogle}
          className={cn(KEY, 'hidden h-10 px-4 text-3xs sm:inline-flex')}
        >
          Sign in
        </button>
      </header>

      <main className="flex flex-1 flex-col">
        <section className="landing-rise mx-auto flex w-full max-w-6xl flex-col items-start gap-5 px-5 pt-12 md:pt-20">
          <span className="flex items-center gap-2 text-3xs text-muted uppercase">
            <span aria-hidden="true" className="led led-pulse" />
            Live sports · your stakes
          </span>
          <h1 className="max-w-4xl text-[2.75rem] leading-[0.98] font-extrabold tracking-[-0.04em] md:text-7xl">
            Every play that matters to you,{' '}
            <span className="font-dots font-black tracking-[-0.02em] whitespace-nowrap">
              live<span className="text-signal">.</span>
            </span>
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-muted md:text-lg">
            Your teams, your predictions and your fantasy matchups in one live
            feed, on your phone and your desktop.
          </p>
          <div className="mt-1 flex flex-col items-start gap-2.5">
            <CallToAction />
            <span className="text-3xs text-muted uppercase">
              Sign in to start. Your connected accounts stay yours.
            </span>
          </div>
        </section>

        {/* The product as objects, drawn with its own parts. */}
        <section
          aria-hidden="true"
          inert
          className="landing-rise mx-auto mt-12 w-full max-w-6xl px-5 md:mt-16"
          style={{ animationDelay: '0.15s' }}
        >
          <div className="well relative flex flex-col items-center gap-10 overflow-hidden rounded-sheet px-4 pt-10 pb-6 md:flex-row md:items-end md:justify-center md:gap-14 md:px-10 md:pt-12">
            <span className="absolute top-4 left-5 text-3xs text-muted uppercase">
              Fig. 1 · On the phone and the desk
            </span>
            <figure className="flex flex-col items-center gap-3">
              <Phone />
              <Caption index="A">Timeline · All</Caption>
            </figure>
            <figure className="hidden flex-col items-center gap-3 md:flex md:self-center">
              <Device />
              <ol className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-3xs text-muted uppercase">
                {[
                  'Dot display',
                  'Scope keys',
                  'Stake lights',
                  'Calls the plays',
                ].map((c, i) => (
                  <li key={c} className="flex items-center gap-1.5">
                    <span className="flex size-4 items-center justify-center rounded-full border border-current text-[9px]">
                      {i + 1}
                    </span>
                    {c}
                  </li>
                ))}
              </ol>
            </figure>
          </div>
        </section>

        <section
          aria-labelledby="landing-tabs"
          className="mx-auto w-full max-w-6xl px-5 pt-16 md:pt-24"
        >
          <SectionLabel
            index="B1"
            title={<span id="landing-tabs">Four ways to watch</span>}
          >
            Same order, every screen
          </SectionLabel>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {TABS.map((t, i) => (
              <li
                key={t.label}
                className="landing-rise flex flex-col gap-3 rounded-card border border-border bg-surface p-4"
                style={{ animationDelay: `${0.2 + i * 0.08}s` }}
              >
                <span className="flex items-center gap-2 text-3xs font-bold uppercase">
                  <span className="well flex size-7 items-center justify-center rounded-control">
                    <NavGlyph name={t.icon} className="size-4" />
                  </span>
                  {t.label}
                </span>
                <span className="flex items-center gap-2 text-2xl font-bold tracking-tight tabular-nums">
                  {t.live && <span aria-hidden="true" className="led" />}
                  {t.figure}
                </span>
                <p className="text-[13px] leading-snug text-muted">{t.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section
          aria-labelledby="landing-steps"
          className="mx-auto w-full max-w-6xl px-5 pt-16 pb-14 md:pt-20"
        >
          <SectionLabel
            index="B2"
            title={<span id="landing-steps">Set up in a minute</span>}
          >
            Everything’s optional
          </SectionLabel>
          <ol className="mt-3 grid rounded-card border border-border bg-surface md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li
                key={s.title}
                className="flex gap-4 border-border p-4 not-last:border-b md:not-last:border-r md:not-last:border-b-0"
              >
                <span className="pt-0.5 font-label text-3xs text-muted">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span>
                  <span className="block text-[15px] font-semibold">
                    {s.title}
                  </span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-muted">
                    {s.text}
                  </span>
                </span>
              </li>
            ))}
          </ol>
          <div className="mt-10 flex flex-col items-center gap-3">
            <Mark className="h-8" />
            <CallToAction />
          </div>
        </section>
      </main>

      <footer
        aria-hidden="true"
        className="well overflow-hidden py-2.5 pb-[max(env(safe-area-inset-bottom),0.625rem)]"
      >
        <div className="landing-ticker flex w-max gap-8 text-3xs whitespace-nowrap text-muted uppercase tabular-nums">
          {[...TICKER, ...TICKER].map((t, i) => (
            <span key={i} className="flex items-center gap-2">
              <span
                className={cn('led size-1.5', t.endsWith('Final') && 'led-off')}
              />
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
      className={cn(KEY, 'key-ink h-12 px-5 text-2xs')}
    >
      <span className="flex size-6 items-center justify-center rounded-full bg-white">
        <GoogleMark />
      </span>
      Continue with Google
    </button>
  )
}

function Caption({
  index,
  children,
}: {
  index: string
  children: React.ReactNode
}) {
  return (
    <figcaption className="flex items-center gap-2 text-3xs text-muted uppercase">
      <span className="rounded-[5px] border border-border px-1.5 leading-4">
        {index}
      </span>
      {children}
    </figcaption>
  )
}

const noop = () => {}

/** The home board's hero: the headline Game in dots over its meter. */
function Board() {
  const g = GAMES[1]
  return (
    <div className="rounded-card border border-border bg-surface p-3">
      <div className="flex items-center justify-between text-[9px] whitespace-nowrap text-muted uppercase">
        <span className="flex items-center gap-1.5">
          <span className="led led-pulse" />4 live · Tue
        </span>
        <span>All leagues</span>
      </div>
      <div className="mt-2.5 mb-2 grid grid-cols-2">
        <span>
          <span className="block text-3xs text-muted uppercase">
            {g.awayTeam.abbreviation} · Q4 0:38
          </span>
          <Num className="mt-1 block text-5xl">{g.score.away}</Num>
        </span>
        <span className="text-right">
          <span className="block text-3xs text-muted uppercase">
            {g.homeTeam.abbreviation}
          </span>
          <Num className="mt-1 block text-5xl text-live">{g.score.home}</Num>
        </span>
      </div>
      <Meter value={0.81} label="Celtics win chance" thin />
      <div className="mt-1.5 flex justify-between text-[9px] text-muted uppercase">
        <span>NY</span>
        <span>Celtics win chance 81%</span>
        <span>BOS</span>
      </div>
    </div>
  )
}

function Feed({ moments }: { moments: ReadonlyArray<Moment> }) {
  return (
    <ol className="flex flex-col">
      {moments.map((m, i) => (
        <li
          key={m.text}
          className="grid grid-cols-[18px_1fr_auto] items-baseline gap-2 border-b border-border py-2.5 last:border-b-0"
        >
          <span className="font-label text-[9px] text-muted">
            {String(i + 1).padStart(2, '0')}
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] leading-snug font-medium">
              {m.text}
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9px] uppercase">
              <span className="text-muted">
                {m.ago} · {m.game}
              </span>
              {m.stake && (
                <span className="flex items-center gap-1 text-live">
                  <span className="size-1.5 rounded-full bg-signal" />
                  {m.stake}
                </span>
              )}
            </span>
          </span>
          <span className={cn('text-xs', m.scoring && 'text-live')}>
            {m.scoring ? '●' : '○'}
          </span>
        </li>
      ))}
    </ol>
  )
}

const DOCK: ReadonlyArray<{ icon: IconName; label: string }> = [
  { icon: 'follows', label: 'Following' },
  { icon: 'all', label: 'All' },
  { icon: 'predictions', label: 'Predictions' },
  { icon: 'fantasy', label: 'Fantasy' },
]

/** The phone: the Timeline's All tab, its board, its feed and the dock. */
function Phone() {
  return (
    <div className="relative w-[300px] rounded-[2.75rem] bg-black p-2.5 shadow-[0_0_0_1.5px_#2a2a2a,0_40px_70px_-30px_rgb(0_0_0/0.45)]">
      <div className="relative h-[600px] overflow-hidden rounded-[2.1rem] bg-background text-foreground">
        <span className="absolute top-2.5 left-1/2 z-10 h-6 w-24 -translate-x-1/2 rounded-full bg-black" />
        <div className="flex h-10 items-end justify-between px-6 pb-1 text-[11px] font-semibold">
          <span>9:41</span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-3 rounded-[2px] bg-current" />
            <span className="h-2 w-4 rounded-[3px] bg-current" />
          </span>
        </div>
        <div className="flex flex-col gap-3 px-3 pt-2">
          <div className="flex items-center justify-between">
            <span className="text-xl font-semibold tracking-tight">All</span>
            <span className="flex gap-1.5">
              {['Alrt', 'Agnt'].map((k) => (
                <span key={k} className={cn(KEY, 'h-8 px-2 text-[9px]')}>
                  {k}
                </span>
              ))}
            </span>
          </div>
          <Board />
          <LiveBoard
            pages={PAGES.slice(0, 2)}
            current="all"
            stakesOf={stakesOf}
            layout="grid"
            onLayout={noop}
            onPick={noop}
          />
          <Feed moments={MOMENTS.slice(0, 2)} />
        </div>
        <div className="glass-nav absolute inset-x-2.5 bottom-2.5 grid grid-cols-4 gap-1 rounded-[1.5rem] p-1.5">
          {DOCK.map((t) => (
            <span
              key={t.label}
              className={cn(
                'flex flex-col items-center gap-0.5 rounded-[1.1rem] py-1.5 font-label text-[8px] tracking-wide text-glass-ink-muted uppercase',
                t.icon === 'all' && 'key key-pressed text-foreground',
              )}
            >
              <span className="relative">
                <NavGlyph name={t.icon} />
                {t.icon === 'all' && (
                  <span className="absolute -top-px -right-1 size-1.5 rounded-full bg-signal shadow-[0_0_6px_var(--signal)]" />
                )}
              </span>
              {t.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

/** The imagined device: a dot display, scope keys and stake lights. */
function Device() {
  return (
    <div
      className="relative grid h-[290px] w-[420px] grid-cols-[1fr_112px] grid-rows-[1fr_auto] gap-x-5 gap-y-3.5 rounded-[2rem] px-6 pt-6 pb-5"
      style={{
        background:
          'linear-gradient(180deg, var(--key-top), var(--key-bottom))',
        boxShadow:
          'inset 0 2px 0 var(--key-highlight), 0 0 0 1px var(--border), 0 50px 80px -40px var(--key-shade)',
      }}
    >
      {[
        'top-3 left-3',
        'top-3 right-3',
        'bottom-3 left-3',
        'right-3 bottom-3',
      ].map((at) => (
        <span
          key={at}
          className={cn(
            'absolute size-2.5 rounded-full bg-notice shadow-[inset_0_1px_1px_var(--key-shade)]',
            at,
          )}
        />
      ))}
      {/* The display: always dark glass, dots lit. */}
      <div className="flex flex-col justify-between overflow-hidden rounded-card bg-black p-4 text-[#f2f1ec] shadow-[inset_0_0_0_2px_#000,inset_0_6px_20px_rgb(0_0_0/0.6)]">
        <span className="flex items-center justify-between font-label text-[10px] tracking-widest text-[#8f8e88] uppercase">
          KC @ DEN
          <span className="led led-pulse" />
        </span>
        <span className="font-dots text-2xl leading-none font-black text-signal">
          WADDLE TD
        </span>
        <span className="font-dots text-base leading-none font-bold text-[#bdbcb5]">
          18 YDS FROM NIX
        </span>
        <Num className="text-[2.75rem]">
          20<span className="text-[#5a5a56]">:</span>24
        </Num>
      </div>
      <div className="flex flex-col gap-2.5">
        <div className="grid grid-cols-2 gap-2.5">
          {['Foll', 'All', 'Pred', 'Fant'].map((s) => (
            <span
              key={s}
              className={cn(
                KEY,
                'h-11 text-[9px]',
                s === 'Foll' && 'key-pressed',
              )}
            >
              {s}
            </span>
          ))}
        </div>
        <span className="mt-1 text-[9px] text-muted uppercase">Stakes</span>
        <span className="flex gap-2">
          <span className="led size-3" />
          <span className="led size-3" />
          <span className="led led-off size-3" />
        </span>
      </div>
      <span className="col-span-2 grid grid-cols-[repeat(18,6px)] gap-[5px]">
        {Array.from({ length: 36 }, (_, i) => (
          <span
            key={i}
            className="size-1.5 rounded-full bg-foreground/25 shadow-[inset_0_1px_1px_rgb(0_0_0/0.4)]"
          />
        ))}
      </span>
    </div>
  )
}

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
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
