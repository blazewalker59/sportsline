/**
 * Start's options: server functions' typed errors cross the wire as
 * themselves (src/lib/userError.ts).
 */

import { createStart } from '@tanstack/react-start'
import { userErrorAdapter } from '@/lib/userError'

export const startInstance = createStart(() => ({
  serializationAdapters: [userErrorAdapter],
}))
