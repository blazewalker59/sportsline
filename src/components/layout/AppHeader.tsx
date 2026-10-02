import { Link } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { ThemeButton } from './ThemeButton'
import { signIn, signOutClient } from '@/lib/auth/client'
import { VIEWER_KEY, useViewer } from '@/lib/viewer/useViewer'

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
          ? 'sticky top-0 z-10 -mx-4 mb-3 bg-background/90 px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3 backdrop-blur'
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
        <div className="absolute right-0 mt-2 w-44 rounded-xl border border-border bg-surface p-1 text-sm shadow-lg">
          <p className="truncate px-3 py-2 text-muted">{viewer.name}</p>
          <Link
            to="/follows"
            onClick={() => setOpen(false)}
            className="block rounded-lg px-3 py-2 hover:bg-background"
          >
            Follows
          </Link>
          <button
            type="button"
            onClick={() =>
              void signOutClient().then(() => {
                setOpen(false)
                void queryClient.invalidateQueries({ queryKey: VIEWER_KEY })
              })
            }
            className="block w-full rounded-lg px-3 py-2 text-left hover:bg-background"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
