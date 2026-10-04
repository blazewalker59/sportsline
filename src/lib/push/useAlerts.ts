import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import {
  deletePushSubscription,
  getAlertLevels,
  getPushKey,
  savePushSubscription,
  setAlertLevels,
} from './server'
import { b64urlDecode } from './webpush'
import type { AlertLevels } from './alerts'

/**
 * This device's Alerts state. On iPhone, Web Push only works once the site
 * is added to the Home Screen (iOS 16.4+), so Safari gets `needs-install`.
 */
export type AlertsState =
  'loading' | 'unsupported' | 'needs-install' | 'denied' | 'off' | 'on'

function isIos(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

async function registration(): Promise<ServiceWorkerRegistration> {
  return (
    (await navigator.serviceWorker.getRegistration('/')) ??
    navigator.serviceWorker.register('/sw.js')
  )
}

export function useAlerts() {
  const [state, setState] = useState<AlertsState>('loading')
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    if (
      !('serviceWorker' in navigator) ||
      !('PushManager' in window) ||
      !('Notification' in window)
    ) {
      setState(isIos() && !isStandalone() ? 'needs-install' : 'unsupported')
      return
    }
    if (isIos() && !isStandalone()) return setState('needs-install')
    if (Notification.permission === 'denied') return setState('denied')
    const sub = await (await registration()).pushManager.getSubscription()
    setState(sub ? 'on' : 'off')
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  /** Must run from a tap: iOS only shows the permission prompt for a user gesture. */
  const enable = useCallback(async () => {
    setBusy(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted')
        return setState(permission === 'denied' ? 'denied' : 'off')
      const key = await getPushKey()
      if (!key) return setState('unsupported')
      const reg = await registration()
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: b64urlDecode(key),
        }))
      const json = sub.toJSON() as {
        endpoint: string
        keys: { p256dh: string; auth: string }
      }
      await savePushSubscription({
        data: { endpoint: json.endpoint, keys: json.keys },
      })
      setState('on')
    } finally {
      setBusy(false)
    }
  }, [])

  const disable = useCallback(async () => {
    setBusy(true)
    try {
      const sub = await (await registration()).pushManager.getSubscription()
      if (sub) {
        await deletePushSubscription({
          data: { endpoint: sub.endpoint },
        }).catch(() => undefined)
        await sub.unsubscribe()
      }
      setState('off')
    } finally {
      setBusy(false)
    }
  }, [])

  return { state, busy, enable, disable }
}

const LEVELS_KEY = ['alert-levels'] as const

/** The Viewer's Alert levels; a change shows at once and saves behind. */
export function useAlertLevels(enabled: boolean) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: LEVELS_KEY,
    queryFn: () => getAlertLevels(),
    enabled,
    staleTime: 5 * 60_000,
  })
  const save = useMutation({
    mutationFn: (levels: AlertLevels) => setAlertLevels({ data: levels }),
    onMutate: (levels) => queryClient.setQueryData(LEVELS_KEY, levels),
    onSettled: () => queryClient.invalidateQueries({ queryKey: LEVELS_KEY }),
  })
  return { levels: query.data, set: (l: AlertLevels) => save.mutate(l) }
}
