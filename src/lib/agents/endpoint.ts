/**
 * `/mcp`: Sportsline's MCP server for Agents (docs/adr/0007). Each request
 * carries a Viewer's API token as `Authorization: Bearer sl_…`; one
 * JSON-RPC message per POST, answered with JSON.
 */

import { INSTRUCTIONS, TRADE_INSTRUCTIONS, sportslineTools } from './tools'
import { handleMcp, parseError } from './mcp'
import { bearerToken, verifyToken } from './tokens'
import type { CloudflareEnv } from '@/lib/db'
import { dbFromD1 } from '@/lib/db'
import { reportError } from '@/lib/ops/errors'

export const MCP_PATH = '/mcp'
const MAX_BODY_BYTES = 64 * 1024

export async function serveMcp(
  request: Request,
  env: CloudflareEnv,
): Promise<Response> {
  // No server-to-client stream: every reply comes back on its POST.
  if (request.method !== 'POST') {
    return new Response('Method not allowed', {
      status: 405,
      headers: { allow: 'POST' },
    })
  }
  // Agents call from servers; a browser page on another site never may.
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) {
    return new Response('Forbidden', { status: 403 })
  }

  const db = dbFromD1(env.DB)
  const token = bearerToken(request.headers.get('authorization'))
  const caller = token ? await verifyToken(db, token) : null
  if (!caller) {
    return new Response('A Sportsline API token is required', {
      status: 401,
      headers: { 'www-authenticate': 'Bearer realm="sportsline"' },
    })
  }

  const text = await request.text()
  if (text.length > MAX_BODY_BYTES) {
    return new Response('Request too large', { status: 413 })
  }
  let message: unknown
  try {
    message = JSON.parse(text)
  } catch {
    return Response.json(parseError, { status: 400 })
  }

  try {
    const reply = await handleMcp(
      message,
      sportslineTools(env, db, caller),
      caller.scopes.includes('trade')
        ? `${INSTRUCTIONS} ${TRADE_INSTRUCTIONS}`
        : INSTRUCTIONS,
    )
    return reply === null
      ? new Response(null, { status: 202 })
      : Response.json(reply)
  } catch (error) {
    await reportError(env, 'mcp', error, { viewerId: caller.viewerId })
    return new Response('Internal error', { status: 500 })
  }
}
