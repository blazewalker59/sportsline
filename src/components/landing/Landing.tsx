/**
 * The front door: Sportsline is for signed-in Viewers, so a visitor sees
 * this and nothing else. A night-game stage (team-color glow over yard
 * lines), a phone whose feed plays out the way the app does, a score
 * ticker, and one way in. Motion stops for reduced-motion settings.
 */

import { signIn } from '@/lib/auth/client'

const logo = (league: string, abbr: string) =>
  `https://a.espncdn.com/combiner/i?img=/i/teamlogos/${league}/500/${abbr}.png&w=80&h=80`

interface Moment {
  team: string
  logo: string
  color: string
  ink: string
  headline: string
  who: string
  line: string
  tag?: string
}

/** A night of plays, as the feed shows them. */
const MOMENTS: ReadonlyArray<Moment> = [
  {
    team: 'KC',
    logo: logo('nfl', 'kc'),
    color: '#E31837',
    ink: '#ffffff',
    headline: 'Touchdown',
    who: 'Mahomes → Kelce · 18 yds',
    line: 'KC 24 – 20 BUF · Q4 1:42',
    tag: '★ Yours · Kelce',
  },
  {
    team: 'LAD',
    logo: logo('mlb', 'lad'),
    color: '#005A9C',
    ink: '#ffffff',
    headline: 'Home run',
    who: 'Ohtani · 431 ft to right',
    line: 'LAD 5 – 3 SD · Bot 8th',
  },
  {
    team: 'EDM',
    logo: logo('nhl', 'edm'),
    color: '#FF4C00',
    ink: '#111318',
    headline: 'Power-play goal',
    who: 'McDavid from Draisaitl',
    line: 'EDM 3 – 2 VAN · 3rd 4:12',
  },
  {
    team: 'BOS',
    logo: logo('nba', 'bos'),
    color: '#007A33',
    ink: '#ffffff',
    headline: 'Three-pointer',
    who: 'Tatum · step-back',
    line: 'BOS 104 – 101 NYK · Q4 0:38',
    tag: 'Prediction · Celtics win: 81% ▲22',
  },
]

const TICKER = [
  'KC 24 · BUF 20 · Q4',
  'LAD 5 · SD 3 · B8',
  'EDM 3 · VAN 2 · 3rd',
  'BOS 104 · NYK 101 · Q4',
  'UGA 31 · ALA 28 · Final',
  'PHI 17 · DAL 13 · Q3',
  'NYY 2 · HOU 2 · T6',
  'DEN 88 · MIN 90 · Q4',
]

const FEEDS = [
  {
    title: 'Following',
    text: 'Every score from your teams and players, as it happens.',
  },
  {
    title: 'Predictions',
    text: 'Your Kalshi odds moving with the game, legs and all.',
  },
  {
    title: 'Fantasy',
    text: 'ESPN and Sleeper matchups, live, starter by starter.',
  },
]

export function Landing() {
  return (
    <div className="landing relative isolate flex min-h-dvh flex-col overflow-hidden bg-[#07080c] text-white">
      {/* The stage: team-color glow drifting over yard lines. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
      >
        <span className="landing-glow left-[-20%] top-[-10%] bg-[#E31837]" />
        <span className="landing-glow landing-glow-2 right-[-25%] top-[20%] bg-[#005A9C]" />
        <span className="landing-glow landing-glow-3 bottom-[-20%] left-[10%] bg-[#007A33]" />
        <span className="landing-field absolute inset-0" />
        <span className="absolute inset-0 bg-gradient-to-b from-transparent via-[#07080c]/40 to-[#07080c]" />
      </div>

      <header className="mx-auto flex w-full max-w-5xl items-center gap-2 px-5 pt-[max(env(safe-area-inset-top),1.25rem)]">
        <img src="/favicon.svg" alt="" width={28} height={28} />
        <span className="text-lg font-bold tracking-tight">Sportsline</span>
        <span className="ml-1 flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase">
          <span className="landing-live size-1.5 rounded-full bg-[#ff5a4e]" />
          Live
        </span>
      </header>

      <main className="mx-auto grid w-full max-w-5xl flex-1 items-center gap-8 px-5 py-8 md:grid-cols-[1.1fr_1fr] md:gap-x-14 md:gap-y-8 md:py-10">
        <section className="landing-rise flex flex-col gap-6 md:col-start-1 md:row-start-1 md:self-end">
          <h1 className="text-[2.6rem] leading-[1.02] font-extrabold tracking-tight md:text-6xl">
            Every play that matters to you,{' '}
            <span className="landing-ink bg-gradient-to-r from-[#ffb612] via-[#ff5a4e] to-[#8fbce6] bg-clip-text text-transparent">
              live.
            </span>
          </h1>
          <p className="max-w-md text-base leading-relaxed text-white/70 md:text-lg">
            Your teams, your predictions and your fantasy matchups in one live
            feed, from the first pitch to the last whistle.
          </p>
          <div className="flex flex-col items-start gap-2">
            <button
              type="button"
              onClick={() =>
                void signIn.social({ provider: 'google', callbackURL: '/' })
              }
              className="landing-cta flex min-h-12 items-center gap-3 rounded-full bg-white px-6 text-[15px] font-semibold text-[#111318] shadow-[0_8px_30px_rgba(255,255,255,0.15)] transition-transform active:scale-[0.98]"
            >
              <GoogleMark />
              Continue with Google
            </button>
            <span className="text-xs text-white/50">
              Sign in to start. Your connected accounts stay yours.
            </span>
          </div>
        </section>

        <section
          aria-hidden="true"
          className="landing-rise mx-auto w-full max-w-[340px] md:col-start-2 md:row-span-2 md:row-start-1"
          style={{ animationDelay: '0.15s' }}
        >
          <Phone />
        </section>

        <ul className="grid gap-3 sm:grid-cols-3 md:col-start-1 md:row-start-2 md:self-start">
          {FEEDS.map((f, i) => (
            <li
              key={f.title}
              className="landing-rise rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 backdrop-blur-sm"
              style={{ animationDelay: `${0.25 + i * 0.12}s` }}
            >
              <p className="text-sm font-bold">{f.title}</p>
              <p className="mt-0.5 text-[13px] leading-snug text-white/60">
                {f.text}
              </p>
            </li>
          ))}
        </ul>
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

/** A phone running the feed: each play types in, then lands. */
function Phone() {
  return (
    <div className="relative rounded-[2.4rem] border border-white/15 bg-[#0e1015] p-3 shadow-[0_30px_80px_rgba(0,0,0,0.6)]">
      <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-white/15" />
      <div className="mb-3 flex gap-1.5 px-1">
        {['All', 'Following', 'Predictions', 'Fantasy'].map((s, i) => (
          <span
            key={s}
            className={
              i === 0
                ? 'rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-[#111318]'
                : 'rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-white/60'
            }
          >
            {s}
          </span>
        ))}
      </div>
      <ol className="relative flex h-[340px] flex-col md:h-[420px] justify-end gap-2.5 overflow-hidden px-1 pb-1 [mask-image:linear-gradient(to_bottom,transparent,black_18%)]">
        {MOMENTS.map((m, i) => (
          <li
            key={m.team}
            className="landing-moment flex items-end gap-2"
            style={{ animationDelay: `${i * 2.2}s` }}
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/10">
              <img src={m.logo} alt="" width={22} height={22} />
            </span>
            <span className="flex min-w-0 flex-col gap-1">
              <span
                className="flex flex-col gap-1 rounded-2xl rounded-bl-md px-3.5 py-2.5"
                style={{ background: m.color, color: m.ink }}
              >
                <span className="text-[17px] leading-none font-extrabold tracking-tight">
                  {m.headline}
                </span>
                <span className="text-[13px] leading-snug font-bold">
                  {m.who}
                </span>
                <span className="text-[11px] font-semibold opacity-80 tabular-nums">
                  {m.line}
                </span>
              </span>
              {m.tag && (
                <span className="px-1 text-[10px] font-semibold text-[#ffb612]">
                  {m.tag}
                </span>
              )}
            </span>
          </li>
        ))}
        <li className="landing-typing flex items-center gap-2">
          <span className="size-8 shrink-0 rounded-full bg-white/10" />
          <span className="flex gap-1 rounded-2xl bg-white/10 px-3 py-2.5">
            {[0, 1, 2].map((d) => (
              <span
                key={d}
                className="size-1.5 rounded-full bg-white/60"
                style={{ animation: `typing-dot 1.2s ${d * 0.2}s infinite` }}
              />
            ))}
          </span>
        </li>
      </ol>
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
