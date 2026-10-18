import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { isSignInRequired } from '@/lib/userError'
import { VIEWER_KEY } from '@/lib/viewer/queries'

/** Retries for any other failure, as React Query does by default. */
const RETRIES = 3

export function getContext() {
  // A session that ended mid-visit (signed out elsewhere, expired): check
  // it again, and the Gate shows the Landing. Never worth retrying.
  const signedOut = (error: unknown) => {
    if (isSignInRequired(error))
      void queryClient.invalidateQueries({ queryKey: VIEWER_KEY })
  }
  const queryClient: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError: signedOut }),
    mutationCache: new MutationCache({ onError: signedOut }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failures, error) =>
          !isSignInRequired(error) && failures < RETRIES,
      },
    },
  })
  return {
    queryClient,
  }
}
