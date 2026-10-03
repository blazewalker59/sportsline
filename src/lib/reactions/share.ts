/**
 * A reacted-to message as a PNG on the clipboard, for sharing elsewhere.
 * The clipboard write starts inside the tap (browsers require a user
 * gesture) with the image still rendering: ClipboardItem takes a promise.
 */

import { domToBlob } from 'modern-screenshot'

export async function captureNode(node: HTMLElement): Promise<Blob> {
  const background = getComputedStyle(document.body).backgroundColor
  return domToBlob(node, {
    scale: Math.min(3, Math.max(2, window.devicePixelRatio || 2)),
    backgroundColor: background,
    type: 'image/png',
  })
}

/** Copy the image once `image` resolves; false if the browser refused. */
export async function copyImage(image: Promise<Blob>): Promise<boolean> {
  try {
    if (typeof ClipboardItem === 'undefined')
      throw new Error('No ClipboardItem')
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': image })])
    return true
  } catch {
    // Browsers without promise support in ClipboardItem: try with the
    // finished image (may fail once the gesture has expired).
    try {
      const blob = await image
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob }),
      ])
      return true
    } catch {
      return false
    }
  }
}
