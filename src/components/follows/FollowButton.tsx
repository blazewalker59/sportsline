import type { ViewerFollow } from '@/lib/model/timeline'
import { cn } from '@/lib/utils'
import { followKey, useSetFollow, useViewer } from '@/lib/viewer/useViewer'

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
        'shrink-0 rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-60',
        following
          ? 'border-foreground/60 bg-foreground text-background'
          : 'border-border text-muted hover:text-foreground',
        className,
      )}
    >
      {following ? 'Following' : 'Follow'}
    </button>
  )
}
