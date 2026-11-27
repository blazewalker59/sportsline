/**
 * Cash out and Open in Kalshi over HTTP, for the signed-in Viewer
 * (docs/adr/0012; kalshi/cashOutRun.ts does the work).
 */

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  acceptQuote,
  dropQuote,
  kalshiLinks,
  previewCashOut,
  readCashOut,
  requestQuote,
  sellSingle,
} from './cashOutRun'
import type { CashOutPreview, CashOutView, KalshiLinks } from './cashOutRun'
import { getCloudflareEnv } from '@/lib/db'
import { reportError } from '@/lib/ops/errors'
import { UserError } from '@/lib/userError'
import { viewerMiddleware } from '@/lib/viewer/middleware'

export type { CashOutPreview, CashOutView, KalshiLinks }

const predictionId = z.string().min(1).max(400)
const cashOutId = z.string().uuid()
const count = z.number().positive().max(1_000_000)

/** Kalshi's own trouble, in the Viewer's words; ours stay as they are. */
async function guarded<T>(
  step: string,
  viewerId: string,
  run: () => Promise<T>,
) {
  try {
    return await run()
  } catch (error) {
    if (error instanceof UserError) throw error
    await reportError(getCloudflareEnv(), 'cash-out', error, { step, viewerId })
    throw new UserError('Kalshi didn’t answer. Nothing was sold; try again.')
  }
}

export const getKalshiLinks = createServerFn({ method: 'GET' })
  .middleware([viewerMiddleware])
  .validator((data: { predictionId: string }) =>
    z.object({ predictionId }).parse(data),
  )
  .handler(
    async ({ data, context: { viewerId } }): Promise<KalshiLinks | null> =>
      kalshiLinks(getCloudflareEnv(), viewerId, data.predictionId).catch(
        () => null,
      ),
  )

export const getCashOutPreview = createServerFn({ method: 'GET' })
  .middleware([viewerMiddleware])
  .validator((data: { predictionId: string }) =>
    z.object({ predictionId }).parse(data),
  )
  .handler(async ({ data, context: { viewerId } }): Promise<CashOutPreview> =>
    guarded('preview', viewerId, () =>
      previewCashOut(getCloudflareEnv(), viewerId, data.predictionId),
    ),
  )

export const cashOutSingle = createServerFn({ method: 'POST' })
  .middleware([viewerMiddleware])
  .validator(
    (data: {
      predictionId: string
      id: string
      count: number
      limitCents: number
    }) =>
      z
        .object({
          predictionId,
          id: cashOutId,
          count,
          limitCents: z.number().int().min(1).max(99),
        })
        .parse(data),
  )
  .handler(async ({ data, context: { viewerId } }): Promise<CashOutView> =>
    guarded('order', viewerId, () =>
      sellSingle(getCloudflareEnv(), viewerId, data),
    ),
  )

export const requestCashOutQuote = createServerFn({ method: 'POST' })
  .middleware([viewerMiddleware])
  .validator((data: { predictionId: string; id: string; count: number }) =>
    z.object({ predictionId, id: cashOutId, count }).parse(data),
  )
  .handler(async ({ data, context: { viewerId } }): Promise<CashOutView> =>
    guarded('rfq', viewerId, () =>
      requestQuote(getCloudflareEnv(), viewerId, data),
    ),
  )

export const getCashOut = createServerFn({ method: 'GET' })
  .middleware([viewerMiddleware])
  .validator((data: { id: string }) => z.object({ id: cashOutId }).parse(data))
  .handler(async ({ data, context: { viewerId } }): Promise<CashOutView> =>
    guarded('read', viewerId, () =>
      readCashOut(getCloudflareEnv(), viewerId, data.id),
    ),
  )

export const acceptCashOutQuote = createServerFn({ method: 'POST' })
  .middleware([viewerMiddleware])
  .validator((data: { id: string; quoteId: string; price: number }) =>
    z
      .object({
        id: cashOutId,
        quoteId: z.string().min(1).max(100),
        price: z.number().gt(0).lt(1),
      })
      .parse(data),
  )
  .handler(async ({ data, context: { viewerId } }): Promise<CashOutView> =>
    guarded('accept', viewerId, () =>
      acceptQuote(getCloudflareEnv(), viewerId, data),
    ),
  )

export const cancelCashOutQuote = createServerFn({ method: 'POST' })
  .middleware([viewerMiddleware])
  .validator((data: { id: string }) => z.object({ id: cashOutId }).parse(data))
  .handler(async ({ data, context: { viewerId } }): Promise<CashOutView> =>
    guarded('drop', viewerId, () =>
      dropQuote(getCloudflareEnv(), viewerId, data.id),
    ),
  )
