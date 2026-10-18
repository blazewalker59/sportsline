/** What the Agents page's sections share. */

import { tradingQuery } from '@/lib/agents/queries'

export const TRADING_KEY = tradingQuery().queryKey

export const money = (n: number) => `$${n.toFixed(2)}`
