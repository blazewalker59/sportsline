/**
 * Sharp picks over HTTP (docs/adr/0006): the latest slate, and every pick
 * for the track record. Signed-in Viewers only.
 */

import { createServerFn } from '@tanstack/react-start'
import { pickHistory, slateOn } from './queries'
import type { SharpPick } from './queries'
import { getDb } from '@/lib/db'
import { sportsDayOf } from '@/lib/model/sportsDay'
import { requireViewer } from '@/lib/viewer/session'

export type { SharpPick }

/** Today's slate, or the latest one before it (before 10am, yesterday's). */
export const getSharpSlate = createServerFn({ method: 'GET' }).handler(
  async (): Promise<{ day: string; picks: Array<SharpPick> } | null> => {
    await requireViewer()
    return slateOn(getDb(), sportsDayOf(new Date()))
  },
)

/** Every pick so far, compactly, for the record (built on the device). */
export const getSharpHistory = createServerFn({ method: 'GET' }).handler(
  async () => {
    await requireViewer()
    return pickHistory(getDb())
  },
)
