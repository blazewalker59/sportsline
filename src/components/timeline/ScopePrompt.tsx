/**
 * In place of the feed, for a Scope with nothing behind it yet: what it
 * would show, and where to set it up. The nav's four tabs are always
 * there, so a tab is never a dead end.
 */

import { Link } from '@tanstack/react-router'
import type { ScopeSetup } from './useTimelineScope'
import type { IconName } from '@/components/layout/NavIcon'
import { ICON_TONES, NavGlyph } from '@/components/layout/NavIcon'
import { cn } from '@/lib/utils'

const PROMPTS: Record<
  ScopeSetup,
  {
    icon: IconName
    title: string
    body: string
    to: '/follows' | '/predictions' | '/fantasy'
    action: string
  }
> = {
  following: {
    icon: 'follows',
    title: 'Follow your teams',
    body: 'Following shows plays from the Teams, Players and Leagues you follow.',
    to: '/follows',
    action: 'Choose what to follow',
  },
  predictions: {
    icon: 'predictions',
    title: 'Connect Kalshi',
    body: 'Predictions shows plays from the Games your open Predictions depend on, with their Odds moving live.',
    to: '/predictions',
    action: 'Connect on Predictions',
  },
  fantasy: {
    icon: 'fantasy',
    title: 'Connect your Fantasy leagues',
    body: 'Fantasy shows plays by both sides’ Starters in your Matchups, from ESPN or Sleeper.',
    to: '/fantasy',
    action: 'Connect on Fantasy',
  },
  'fantasy-matchups': {
    icon: 'fantasy',
    title: 'No Matchups right now',
    body: 'When your leagues have a Matchup on, both sides’ Starters’ plays show here.',
    to: '/fantasy',
    action: 'Your Fantasy leagues',
  },
}

export function ScopePrompt({ setup }: { setup: ScopeSetup }) {
  const p = PROMPTS[setup]
  return (
    <section
      aria-labelledby="scope-prompt-title"
      data-scope-prompt={setup}
      className="flex flex-col items-center gap-3 rounded-card border border-border bg-surface px-6 py-8 text-center"
    >
      <span
        className={cn(
          'flex size-12 items-center justify-center rounded-full',
          ICON_TONES[p.icon],
        )}
      >
        <NavGlyph name={p.icon} className="size-6" />
      </span>
      <h2 id="scope-prompt-title" className="text-base font-bold">
        {p.title}
      </h2>
      <p className="max-w-80 text-sm text-muted">{p.body}</p>
      <Link
        to={p.to}
        className="mt-1 flex min-h-11 items-center rounded-full bg-foreground px-5 text-sm font-semibold text-background"
      >
        {p.action}
      </Link>
    </section>
  )
}
