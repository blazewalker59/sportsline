/**
 * A reacted-to message as a PNG on the clipboard, for sharing elsewhere.
 * The clipboard write starts inside the tap (browsers require a user
 * gesture) with the image still rendering: ClipboardItem takes a promise.
 */

import { domToBlob } from 'modern-screenshot'

/** A logo that won't load must not hold up the copy. */
const IMAGE_TIMEOUT_MS = 3_000

export async function captureNode(node: HTMLElement): Promise<Blob> {
  // Logos are lazy-loaded, and lazy images off-screen never load: the
  // capture would wait on them forever.
  const images = [...node.querySelectorAll('img')]
  for (const img of images) img.loading = 'eager'
  await Promise.all(
    images.map((img) =>
      Promise.race([
        img.decode().catch(() => undefined),
        new Promise((r) => setTimeout(r, IMAGE_TIMEOUT_MS)),
      ]),
    ),
  )
  const background = getComputedStyle(document.body).backgroundColor
  return domToBlob(node, {
    scale: Math.min(3, Math.max(2, window.devicePixelRatio || 2)),
    backgroundColor: background,
    type: 'image/png',
    timeout: IMAGE_TIMEOUT_MS,
  })
}

/** Copy the image once `image` resolves; false if the browser refused. */
export async function copyImage(image: Promise<Blob>): Promise<boolean> {
  try {
    if (typeof ClipboardItem === 'undefined')
      throw new Error('No ClipboardItem')
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': image })])
    return true
  } catch (error) {
    console.warn('Copying the share image failed; retrying', error)
    // Browsers without promise support in ClipboardItem: try with the
    // finished image (may fail once the gesture has expired).
    try {
      const blob = await image
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob }),
      ])
      return true
    } catch (retryError) {
      console.warn('Copying the share image failed', retryError)
      return false
    }
  }
}
