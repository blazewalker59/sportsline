/**
 * Enough of a Durable Object context to run LiveGame, Scheduler, LiveHub
 * and ViewerSync in Vitest. Storage is a Map; alarms and sockets are
 * recorded so tests can see what the object scheduled and sent.
 */

export class FakeSocket {
  attachment: unknown = null
  sent: Array<string> = []
  closed: Array<{ code: number; reason: string }> = []
  failSend = false

  serializeAttachment(value: unknown): void {
    this.attachment = value
  }

  deserializeAttachment(): unknown {
    return this.attachment
  }

  send(data: string): void {
    if (this.failSend) throw new Error('socket closing')
    this.sent.push(data)
  }

  close(code: number, reason = ''): void {
    this.closed.push({ code, reason })
  }
}

export class FakeWebSocketPair {
  0: FakeSocket
  1: FakeSocket

  constructor() {
    this[0] = new FakeSocket()
    this[1] = new FakeSocket()
  }
}

export function installWebSocketGlobals(): void {
  const g = globalThis as unknown as {
    WebSocketPair: typeof FakeWebSocketPair
    WebSocketRequestResponsePair: new (
      request: string,
      response: string,
    ) => unknown
  }
  g.WebSocketPair = FakeWebSocketPair
  g.WebSocketRequestResponsePair = class {
    constructor(
      public request: string,
      public response: string,
    ) {}
  }
}

export function memoryCtx() {
  const data = new Map<string, unknown>()
  let alarm: number | null = null
  const alarmSets: Array<number> = []
  const sockets: Array<FakeSocket> = []
  return {
    data,
    alarmSets,
    sockets,
    storage: {
      get: <T>(key: string): Promise<T | undefined> =>
        Promise.resolve(data.get(key) as T | undefined),
      put: (
        keyOrEntries: string | Record<string, unknown>,
        value?: unknown,
      ): Promise<void> => {
        if (typeof keyOrEntries === 'string') data.set(keyOrEntries, value)
        else
          for (const [key, entry] of Object.entries(keyOrEntries))
            data.set(key, entry)
        return Promise.resolve()
      },
      delete: (key: string | Array<string>): Promise<number> => {
        const keys = Array.isArray(key) ? key : [key]
        let removed = 0
        for (const k of keys) if (data.delete(k)) removed++
        return Promise.resolve(removed)
      },
      list: <T>(options: { prefix: string }): Promise<Map<string, T>> => {
        const out = new Map<string, T>()
        for (const [key, value] of data)
          if (key.startsWith(options.prefix)) out.set(key, value as T)
        return Promise.resolve(out)
      },
      getAlarm: (): Promise<number | null> => Promise.resolve(alarm),
      setAlarm: (at: number): Promise<void> => {
        alarm = at
        alarmSets.push(at)
        return Promise.resolve()
      },
      deleteAlarm: (): Promise<void> => {
        alarm = null
        return Promise.resolve()
      },
    },
    setWebSocketAutoResponse: (_pair: unknown): void => undefined,
    acceptWebSocket: (ws: FakeSocket): void => {
      sockets.push(ws)
    },
    getWebSockets: (): Array<FakeSocket> => sockets,
  }
}

export type MemoryCtx = ReturnType<typeof memoryCtx>
