import { useEffect, useRef } from 'react'

/**
 * A bottom sheet over the Timeline (box score, Play Detail), so drilling
 * in never leaves the conversation: closing lands exactly where you were.
 */
export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  const close = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    close.current?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [onClose])
  return (
    <div
      className="fixed inset-0 z-30 flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        aria-label={`Close ${title.toLowerCase()}`}
        onClick={onClose}
        className="animate-in fade-in absolute inset-0 bg-black/40 duration-200"
      />
      <div className="animate-in slide-in-from-bottom relative mx-auto flex max-h-[calc(100dvh-max(env(safe-area-inset-top),1.5rem))] w-full max-w-xl flex-col rounded-t-3xl bg-background pb-[env(safe-area-inset-bottom)] shadow-2xl duration-300">
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <span className="flex-1 text-base font-bold">{title}</span>
          <button
            ref={close}
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-full bg-notice px-4 text-[13px] font-semibold"
          >
            Done
          </button>
        </div>
        <div className="flex flex-col gap-4 overflow-y-auto overscroll-contain px-4 py-4 [&>*]:shrink-0">
          {children}
        </div>
      </div>
    </div>
  )
}
