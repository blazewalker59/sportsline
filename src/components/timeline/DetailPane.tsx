/**
 * A Prediction or a Fantasy Matchup beside the wide Timeline (from `lg`),
 * in the pane a selected Game uses: the same content as its bottom sheet
 * (PredictionDetail, MatchupDetail), framed as a pane. A pinned header
 * with the title, any action and Close, then the content, which scrolls
 * on its own. It wears the content's Subject as a sheet does.
 */

import { Link } from '@tanstack/react-router'
import type { SheetParts } from '@/components/chat/Sheet'
import { RowsSkeleton } from '@/components/layout/Skeleton'
import { isPair, subjectStyle } from '@/lib/brand/subject'
import { cn } from '@/lib/utils'

/** The pane's frame for content's SheetParts. */
export function DetailPane({
  kind,
  title,
  action,
  subject = null,
  pinned,
  children,
}: SheetParts & {
  /** What's open, for its Close label and the pane's data attribute. */
  kind: 'prediction' | 'matchup'
}) {
  return (
    <section
      aria-label={title}
      data-detail-pane={kind}
      // Not a Scope swipe; one View Transition layer, shared with the
      // Game pane, so swapping between them fades as one piece.
      data-no-swipe
      style={{
        viewTransitionName: 'game-pane',
        ...subjectStyle(subject),
      }}
      className={cn(
        'sticky top-0 hidden h-dvh min-w-0 flex-col border-l border-border px-4 lg:flex',
        subject && 'subject subject-crown',
        subject && isPair(subject) && 'subject-crown--split',
      )}
    >
      <header
        className={cn(
          'shrink-0 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3',
          // The crown runs on under the title; without one, a rule.
          !pinned && !subject && 'border-b border-border',
        )}
      >
        <div className="flex min-h-9 items-center gap-3">
          <h2 className="min-w-0 flex-1 truncate text-base font-bold tracking-tight">
            {title}
          </h2>
          {action}
          <CloseDetail kind={kind} subject={Boolean(subject)} />
        </div>
        {pinned && <div className="pt-2">{pinned}</div>}
      </header>
      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain pt-2 pb-8 [&>*]:shrink-0',
          // As in a sheet: one team tints every card.
          subject && !isPair(subject) && 'subject-cards',
        )}
      >
        {children}
      </div>
    </section>
  )
}

/** The pane while what it should show is still loading, or is gone. */
export function DetailPaneMissing({
  kind,
  loading,
}: {
  kind: 'prediction' | 'matchup'
  loading: boolean
}) {
  return (
    <DetailPane
      kind={kind}
      title={kind === 'prediction' ? 'Prediction' : 'Matchup'}
    >
      {loading ? (
        <RowsSkeleton
          rows={6}
          label={
            kind === 'prediction' ? 'Loading prediction' : 'Loading matchup'
          }
        />
      ) : (
        <p className="well rounded-card px-3 py-4 text-center text-sm text-muted">
          {kind === 'prediction'
            ? 'This Prediction isn’t in your Kalshi account any more.'
            : 'This Matchup isn’t on in your leagues any more.'}
        </p>
      )}
    </DetailPane>
  )
}

function CloseDetail({
  kind,
  subject,
}: {
  kind: 'prediction' | 'matchup'
  subject: boolean
}) {
  return (
    <Link
      to="/"
      search={(prev) => ({ ...prev, detail: undefined })}
      viewTransition
      resetScroll={false}
      aria-label={`Close ${kind}`}
      title="Close (Esc)"
      className={cn(
        'key flex size-9 shrink-0 items-center justify-center rounded-control',
        subject && 'opacity-90',
      )}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </Link>
  )
}
