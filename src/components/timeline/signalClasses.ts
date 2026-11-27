/**
 * Signal's recurring class sets on the Timeline (docs/design/signal.md),
 * so its segmented controls, keys and labels read as one device.
 */

/** A small label, the way a manual labels a device (Space Mono). */
export const LABEL = 'text-3xs text-muted uppercase'

/** A segmented control's tray: recessed into the page. */
export const SEGMENTS = 'well flex rounded-control p-[3px]'

/** One of its choices: unlit, raised to a cap when chosen (SEGMENT_ON). */
export const SEGMENT =
  'flex items-center justify-center rounded-[8px] text-muted transition-[color,background-color,box-shadow] hover:text-foreground'

/** The chosen choice: a cap standing in the tray. */
export const SEGMENT_ON =
  'bg-surface text-foreground shadow-[0_1px_2px_var(--key-shade),inset_0_1px_0_var(--key-highlight)] hover:text-foreground'

/** A key: a raised cap that presses in (`aria-pressed` holds it down). */
export const KEY =
  'key inline-flex items-center justify-center gap-1.5 rounded-control px-3 text-3xs font-bold uppercase'

/** A chip that is a choice among many: hairline, ink when it's the one. */
export const CHIP =
  'border border-border bg-surface text-foreground transition-colors'
export const CHIP_ON = 'border-foreground bg-foreground text-background'

/** Signal's light: lit and pulsing for live. */
export const LED_LIVE = 'led led-pulse'
