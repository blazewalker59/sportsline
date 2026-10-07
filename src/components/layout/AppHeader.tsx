import { Link } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { ThemeButton } from './ThemeButton'
import { signIn, signOutClient } from '@/lib/auth/client'
import { VIEWER_KEY, useViewer } from '@/lib/viewer/useViewer'
import { cn } from '@/lib/utils'

/** Sticky top bar shared by every screen. `children` sits next to the wordmark. */
export function AppHeader({
  children,
  right,
  title,
  pinned = true,
}: {
  children?: React.ReactNode
  right?: React.ReactNode
  /** Replaces the wordmark (the Timeline shows its day here). */
  title?: React.ReactNode
  /** False when a parent pins a larger top section that includes this bar. */
  pinned?: boolean
}) {
  return (
    <header
      className={
        pinned
          ? 'sticky top-0 z-10 -mx-4 mb-3 bg-background px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3'
          : 'pt-[max(env(safe-area-inset-top),0.5rem)] pb-1'
      }
    >
      <div className="flex items-center gap-2">
        {title ?? (
          <Link to="/" className="text-lg font-bold tracking-tight">
            Sportsline
          </Link>
        )}
        {children}
        <div className="ml-auto flex items-center gap-1.5">
          {right}
          <ThemeButton />
          <AccountButton />
        </div>
      </div>
    </header>
  )
}

function AccountButton() {
  const { data, isPending } = useViewer()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  if (isPending) return <span className="size-7" />

  const viewer = data?.viewer
  if (!viewer) {
    return (
      <button
        type="button"
        onClick={() =>
          void signIn.social({ provider: 'google', callbackURL: '/' })
        }
        className="rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background"
      >
        Sign in
      </button>
    )
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Account"
        aria-expanded={open}
        className="block size-7 overflow-hidden rounded-full border border-border bg-surface text-xs"
      >
        {viewer.image ? (
          <img
            src={viewer.image}
            alt=""
            referrerPolicy="no-referrer"
            className="size-full object-cover"
          />
        ) : (
          viewer.name.slice(0, 1)
        )}
      </button>
      {open && (
        <>
          {/* Tap anywhere else to close. */}
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <nav
            aria-label="Account"
            className="animate-in fade-in slide-in-from-top-1 absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-border bg-surface text-sm shadow-xl duration-150"
          >
            <div className="flex items-center gap-3 border-b border-border px-3 py-3">
              <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-background font-semibold text-muted">
                {viewer.image ? (
                  <img
                    src={viewer.image}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="size-full object-cover"
                  />
                ) : (
                  viewer.name.slice(0, 1)
                )}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-semibold">
                  {viewer.name}
                </span>
                <span className="block truncate text-xs text-muted">
                  {viewer.email}
                </span>
              </span>
            </div>
            <MenuGroup title="Your feed">
              <MenuItem
                to="/follows"
                icon="follows"
                label="Follows"
                hint="Teams, players and your league row"
                onPick={() => setOpen(false)}
              />
              <MenuItem
                to="/reactions"
                icon="reactions"
                label="Reactions"
                hint="Plays you reacted to"
                onPick={() => setOpen(false)}
              />
            </MenuGroup>
            <MenuGroup title="Connected">
              <MenuItem
                to="/predictions"
                icon="predictions"
                label="Predictions"
                hint="Kalshi bets and your record"
                onPick={() => setOpen(false)}
              />
              <MenuItem
                to="/fantasy"
                icon="fantasy"
                label="Fantasy"
                hint="ESPN and Sleeper leagues"
                onPick={() => setOpen(false)}
              />
            </MenuGroup>
            <MenuGroup title="Settings">
              <MenuItem
                to="/alerts"
                icon="alerts"
                label="Alerts"
                hint="What each feed notifies you about"
                onPick={() => setOpen(false)}
              />
              <MenuItem
                to="/agents"
                icon="agents"
                label="Agents"
                hint="Let an AI agent read your picks"
                onPick={() => setOpen(false)}
              />
              {data.isAdmin && (
                <MenuItem
                  to="/admin"
                  icon="health"
                  label="Health"
                  hint="Jobs, syncs and errors"
                  onPick={() => setOpen(false)}
                />
              )}
            </MenuGroup>
            <div className="border-t border-border p-1">
              <button
                type="button"
                onClick={() =>
                  void signOutClient().then(() => {
                    setOpen(false)
                    void queryClient.invalidateQueries({ queryKey: VIEWER_KEY })
                  })
                }
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left font-medium text-live hover:bg-live/10"
              >
                <MenuIcon name="signOut" />
                Sign out
              </button>
            </div>
          </nav>
        </>
      )}
    </div>
  )
}

function MenuGroup({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="border-b border-border px-1 py-1.5 last:border-b-0">
      <p className="px-3 pt-1 pb-1 text-[10px] font-bold tracking-wider text-muted uppercase">
        {title}
      </p>
      {children}
    </div>
  )
}

type IconName =
  | 'follows'
  | 'reactions'
  | 'predictions'
  | 'fantasy'
  | 'alerts'
  | 'agents'
  | 'health'
  | 'signOut'

/** Each section's color, so items read apart at a glance. */
const ICON_TONES: Record<IconName, string> = {
  follows: 'bg-accent/15 text-accent',
  reactions: 'bg-pink-500/15 text-pink-600 dark:text-pink-400',
  predictions: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  fantasy: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  alerts: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  agents: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  health: 'bg-red-500/15 text-red-600 dark:text-red-400',
  signOut: 'bg-live/10 text-live',
}

const ICON_PATHS: Record<IconName, React.ReactNode> = {
  follows: (
    <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" />
  ),
  reactions: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 14.5a4.5 4.5 0 0 0 7 0M9 9.5h.01M15 9.5h.01" />
    </>
  ),
  predictions: <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />,
  fantasy: (
    <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3" />
  ),
  alerts: (
    <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0" />
  ),
  agents: (
    <>
      <rect x="5" y="8" width="14" height="11" rx="3" />
      <path d="M12 8V4M9.5 13h.01M14.5 13h.01M3 13v2M21 13v2" />
    </>
  ),
  health: <path d="M3 12h4l2-5 4 10 2-5h6" />,
  signOut: <path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" />,
}

function MenuIcon({ name }: { name: IconName }) {
  return (
    <span
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-lg',
        ICON_TONES[name],
      )}
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="size-4 fill-none stroke-current stroke-2 [stroke-linecap:round] [stroke-linejoin:round]"
      >
        {ICON_PATHS[name]}
      </svg>
    </span>
  )
}

function MenuItem({
  to,
  icon,
  label,
  hint,
  onPick,
}: {
  to:
    | '/follows'
    | '/reactions'
    | '/predictions'
    | '/fantasy'
    | '/alerts'
    | '/agents'
    | '/admin'
  icon: IconName
  label: string
  hint: string
  onPick: () => void
}) {
  return (
    <Link
      to={to}
      onClick={onPick}
      className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-background"
      activeProps={{ className: 'bg-background', 'aria-current': 'page' }}
    >
      <MenuIcon name={icon} />
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{label}</span>
        <span className="block truncate text-[11px] text-muted">{hint}</span>
      </span>
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="size-4 shrink-0 fill-none stroke-muted stroke-2"
      >
        <path d="m9 6 6 6-6 6" />
      </svg>
    </Link>
  )
}
