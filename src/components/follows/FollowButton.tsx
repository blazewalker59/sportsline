import type { ViewerFollow } from '@/lib/model/timeline'
import { cn } from '@/lib/utils'
import { followKey, useSetFollow, useViewer } from '@/lib/viewer/useViewer'

/**
 * Follow, as a key (Signal): raised to follow, pressed in while following.
 * Never lit: orange is for what's live.
 */
export function FollowButton({
  follow,
  className,
}: {
  follow: ViewerFollow
  className?: string
}) {
  const { data } = useViewer()
  const setFollow = useSetFollow()
  if (!data?.viewer) return null
  const key = followKey(follow)
  const following = data.follows.some((f) => followKey(f.follow) === key)
  return (
    <button
      type="button"
      disabled={setFollow.isPending}
      onClick={() => setFollow.mutate({ follow, following: !following })}
      aria-pressed={following}
      className={cn(
        'key inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-control px-3 text-3xs font-bold uppercase',
        following ? 'text-foreground' : 'text-foreground/80',
        className,
      )}
    >
      {following && (
        <span aria-hidden="true" className="led led-ink size-1.5" />
      )}
      {following ? 'Following' : 'Follow'}
    </button>
  )
}
