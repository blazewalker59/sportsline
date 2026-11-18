import { Link } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { ThemeButton } from './ThemeButton'
import { ICON_TONES, NavGlyph } from './NavIcon'
import type { IconName } from './NavIcon'
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
            className="animate-in fade-in slide-in-from-top-1 absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-card border border-border bg-surface text-sm shadow-xl duration-150"
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
            {/* Timeline, Predictions, Fantasy and Follows live in the main navigation (AppNav). */}
            <MenuGroup title="Your feed">
              <MenuItem
                to="/reactions"
                icon="reactions"
                label="Reactions"
                hint="Plays you reacted to"
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
                className="flex w-full items-center gap-3 rounded-card px-3 py-2 text-left font-medium text-live hover:bg-live/10"
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
      <p className="px-3 pt-1 pb-1 text-3xs font-bold tracking-wider text-muted uppercase">
        {title}
      </p>
      {children}
    </div>
  )
}

function MenuIcon({ name }: { name: IconName }) {
  return (
    <span
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-control',
        ICON_TONES[name],
      )}
    >
      <NavGlyph name={name} />
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
  to: '/reactions' | '/alerts' | '/agents' | '/admin'
  icon: IconName
  label: string
  hint: string
  onPick: () => void
}) {
  return (
    <Link
      to={to}
      onClick={onPick}
      className="flex items-center gap-3 rounded-card px-2 py-1.5 hover:bg-background"
      activeProps={{ className: 'bg-background', 'aria-current': 'page' }}
    >
      <MenuIcon name={icon} />
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{label}</span>
        <span className="block truncate text-2xs text-muted">{hint}</span>
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
