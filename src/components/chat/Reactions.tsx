/**
 * Reactions (CONTEXT.md) on Play bubbles: long-press (or right-click) a
 * bubble for the emoji bar; choosing one saves your Reaction and copies an
 * image of the message to the clipboard for sharing elsewhere.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { LeagueAvatar, PlayBubble, TeamAvatar } from './ChatParts'
import type { ItemReactions, Reaction } from '@/lib/reactions/model'
import type { TeamRef, TimelineItem } from '@/lib/model/timeline'
import { REACTIONS } from '@/lib/reactions/model'
import { useReactions, useSetReaction } from '@/lib/reactions/useReactions'
import { captureNode, copyImage } from '@/lib/reactions/share'
import { proxiedLogo } from '@/lib/logoProxy'
import { useViewer } from '@/lib/viewer/useViewer'
import { cn } from '@/lib/utils'

interface ReactionsApi {
  get: (itemId: string) => ItemReactions | undefined
  open: (item: TimelineItem, anchor: DOMRect) => void
}

const ReactionsContext = createContext<ReactionsApi | null>(null)

export function useItemReactions() {
  return useContext(ReactionsContext)
}

const TOAST_MS = 2600
const LONG_PRESS_MS = 450
const MOVE_TOLERANCE_PX = 8

export function ReactionsProvider({
  sportsDay,
  children,
}: {
  sportsDay: string
  children: React.ReactNode
}) {
  const { data: tallies } = useReactions(sportsDay)
  const setReaction = useSetReaction(sportsDay)
  const { data: viewerState } = useViewer()
  const signedIn = Boolean(viewerState?.viewer)

  const [picker, setPicker] = useState<{
    item: TimelineItem
    anchor: DOMRect
  } | null>(null)
  const [share, setShare] = useState<{
    item: TimelineItem
    emoji: Reaction
  } | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const shareNode = useRef<((node: HTMLElement) => void) | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), TOAST_MS)
    return () => clearTimeout(t)
  }, [toast])

  const api = useMemo<ReactionsApi>(
    () => ({
      get: (itemId) => tallies?.[itemId],
      open: (item, anchor) => {
        // Drop any selection the long-press started before the bar appears.
        window.getSelection()?.removeAllRanges()
        setPicker({ item, anchor })
      },
    }),
    [tallies],
  )

  const choose = useCallback(
    (item: TimelineItem, emoji: Reaction) => {
      setPicker(null)
      const mine = tallies?.[item.id]?.mine ?? null
      if (signedIn) {
        setReaction.mutate({
          itemId: item.id,
          emoji: mine === emoji ? null : emoji,
        })
      }
      if (mine === emoji && signedIn) return // Un-reacting: nothing to share.
      // Render the share card, then capture it; the clipboard write must
      // begin now, inside the tap.
      const image = new Promise<HTMLElement>((resolve) => {
        shareNode.current = resolve
      }).then(captureNode)
      setShare({ item, emoji })
      void copyImage(image)
        .then((copied) =>
          setToast(
            copied
              ? `${emoji} Screenshot copied${signedIn ? '' : ' · sign in to save Reactions'}`
              : 'Couldn’t copy the screenshot',
          ),
        )
        .finally(() => setShare(null))
    },
    [tallies, signedIn, setReaction],
  )

  return (
    <ReactionsContext.Provider value={api}>
      {children}
      {picker && (
        <ReactionPicker
          anchor={picker.anchor}
          mine={tallies?.[picker.item.id]?.mine ?? null}
          onChoose={(emoji) => choose(picker.item, emoji)}
          onClose={() => setPicker(null)}
        />
      )}
      {share &&
        createPortal(
          <ShareCard
            item={share.item}
            emoji={share.emoji}
            onReady={(node) => shareNode.current?.(node)}
          />,
          document.body,
        )}
      {toast && (
        <div
          role="status"
          className="fixed inset-x-0 bottom-[max(env(safe-area-inset-bottom),1rem)] z-40 flex justify-center px-4"
        >
          <span className="animate-in fade-in slide-in-from-bottom-2 rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background shadow-lg">
            {toast}
          </span>
        </div>
      )}
    </ReactionsContext.Provider>
  )
}

/** The emoji bar, above (or below, near the top) the pressed bubble. */
function ReactionPicker({
  anchor,
  mine,
  onChoose,
  onClose,
}: {
  anchor: DOMRect
  mine: Reaction | null
  onChoose: (emoji: Reaction) => void
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    const onScroll = () => onClose()
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll)
    }
  }, [onClose])
  const above = anchor.top > 120
  const width = REACTIONS.length * 48 + 12
  const left = Math.min(Math.max(8, anchor.left), window.innerWidth - width - 8)
  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-label="React">
      <button
        type="button"
        aria-label="Close reactions"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <div
        className="animate-in fade-in zoom-in-95 absolute flex gap-1 rounded-full border border-border bg-surface p-1.5 shadow-xl duration-150"
        style={{
          left,
          top: above ? anchor.top - 60 : anchor.bottom + 8,
        }}
      >
        {REACTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => onChoose(emoji)}
            aria-label={`React ${emoji}`}
            aria-pressed={mine === emoji}
            className={cn(
              'flex size-11 items-center justify-center rounded-full text-[26px] transition-transform active:scale-90',
              mine === emoji ? 'bg-accent-soft' : 'hover:bg-notice',
            )}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Counts under a bubble; yours is highlighted. */
export function ReactionPills({
  reactions,
  align,
}: {
  reactions: ItemReactions | undefined
  align: 'left' | 'right'
}) {
  if (!reactions || reactions.counts.length === 0) return null
  return (
    <span
      className={cn(
        '-mt-2 flex gap-1 px-2',
        align === 'right' ? 'justify-end' : 'justify-start',
      )}
    >
      {reactions.counts.map(({ emoji, count }) => (
        <span
          key={emoji}
          className={cn(
            'relative z-[1] flex items-center gap-0.5 rounded-full border px-1.5 py-px text-[12px] font-semibold tabular-nums shadow-sm',
            reactions.mine === emoji
              ? 'border-accent/50 bg-accent-soft text-accent'
              : 'border-border bg-surface text-muted',
          )}
        >
          {emoji}
          {count > 1 && <span>{count}</span>}
        </span>
      ))}
    </span>
  )
}

/**
 * Long-press and right-click handlers for a bubble: opening the emoji bar
 * swallows the tap that would otherwise open the Play.
 */
export function useLongPress(item: TimelineItem) {
  const reactions = useItemReactions()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const fired = useRef(false)
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    start.current = null
  }
  if (!reactions) return {}
  const openAt = (el: Element) => {
    fired.current = true
    navigator.vibrate?.(10)
    reactions.open(item, el.getBoundingClientRect())
  }
  return {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      fired.current = false
      if (e.button !== 0) return
      start.current = { x: e.clientX, y: e.clientY }
      const el = e.currentTarget
      timer.current = setTimeout(() => {
        cancel()
        openAt(el)
      }, LONG_PRESS_MS)
    },
    onPointerMove: (e: React.PointerEvent) => {
      const s = start.current
      if (
        s &&
        Math.hypot(e.clientX - s.x, e.clientY - s.y) > MOVE_TOLERANCE_PX
      ) {
        cancel()
      }
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onContextMenu: (e: React.MouseEvent<HTMLElement>) => {
      e.preventDefault()
      cancel()
      openAt(e.currentTarget)
    },
    onClickCapture: (e: React.MouseEvent) => {
      if (fired.current) {
        e.preventDefault()
        e.stopPropagation()
        fired.current = false
      }
    },
  }
}

/**
 * What gets copied: the message as it appears in the Timeline, with its
 * game, your Reaction and where it's from. Rendered off-screen with
 * same-origin logos so the canvas can draw them.
 */
function ShareCard({
  item,
  emoji,
  onReady,
}: {
  item: TimelineItem
  emoji: Reaction
  onReady: (node: HTMLElement) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const shareable = useMemo(() => withProxiedLogos(item), [item])
  useEffect(() => {
    if (ref.current) onReady(ref.current)
  }, [onReady])
  const team =
    shareable.side === 'home' ? shareable.homeTeam : shareable.awayTeam
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed top-0 -left-[10000px] w-[380px]"
    >
      <div
        ref={ref}
        className="flex flex-col gap-2 bg-background p-4 font-sans text-foreground"
      >
        <span className="px-1 text-[11px] text-muted">
          <span className="font-semibold text-foreground/80">
            {shareable.awayTeam.abbreviation} {shareable.score.away} –{' '}
            {shareable.score.home} {shareable.homeTeam.abbreviation}
          </span>{' '}
          · {shareable.segmentLabel}
        </span>
        <div className="flex items-end gap-2">
          {shareable.side ? (
            <TeamAvatar team={team} />
          ) : (
            <LeagueAvatar league={shareable.league} />
          )}
          <div className="relative flex flex-col">
            <PlayBubble
              item={shareable}
              align="left"
              position="single"
              reactable={false}
            />
            <span className="absolute -right-2 -bottom-3 flex size-8 items-center justify-center rounded-full border border-border bg-surface text-lg shadow">
              {emoji}
            </span>
          </div>
        </div>
        <span className="mt-2 self-end text-[11px] font-bold tracking-wide text-muted">
          sportsline.dev
        </span>
      </div>
    </div>
  )
}

function withProxiedLogos(item: TimelineItem): TimelineItem {
  const proxy = (t: TeamRef): TeamRef => ({
    ...t,
    logoUrl: proxiedLogo(t.logoUrl),
  })
  return {
    ...item,
    awayTeam: proxy(item.awayTeam),
    homeTeam: proxy(item.homeTeam),
  }
}
