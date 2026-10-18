/**
 * A stand-in for the browser's WebSocket: records every socket opened, and
 * lets a test open, message and drop each one by hand.
 */

export class FakeSocket {
  static all: Array<FakeSocket> = []

  static get latest(): FakeSocket {
    const socket = FakeSocket.all.at(-1)
    if (!socket) throw new Error('No socket opened')
    return socket
  }

  static reset(): void {
    FakeSocket.all = []
  }

  onopen: (() => void) | null = null
  onmessage: ((message: { data: unknown }) => void) | null = null
  onclose: (() => void) | null = null
  sent: Array<string> = []
  closed = false

  constructor(readonly url: string) {
    FakeSocket.all.push(this)
  }

  send(data: string): void {
    this.sent.push(data)
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.onclose?.()
  }

  /** The server accepted the connection. */
  open(): void {
    this.onopen?.()
  }

  /** A frame from the server. */
  message(data: unknown): void {
    this.onmessage?.({
      data: typeof data === 'string' ? data : JSON.stringify(data),
    })
  }

  /** The connection dropped (not closed by the app). */
  drop(): void {
    this.close()
  }
}
