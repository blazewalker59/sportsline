import { useEffect, useState } from 'react'
import type { ThemeChoice } from '@/lib/theme'
import { readThemeChoice, saveThemeChoice } from '@/lib/theme'

const NEXT: Record<ThemeChoice, ThemeChoice> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
}
const LABEL: Record<ThemeChoice, string> = {
  system: 'Theme: match device',
  light: 'Theme: light',
  dark: 'Theme: dark',
}

/** Cycles device → light → dark; remembered in this browser. */
export function ThemeButton() {
  const [choice, setChoice] = useState<ThemeChoice>('system')
  useEffect(() => setChoice(readThemeChoice()), [])
  useEffect(() => {
    if (choice !== 'system') return
    // Follow the device live while on "match device".
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => saveThemeChoice('system')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [choice])

  return (
    <button
      type="button"
      onClick={() => {
        const next = NEXT[choice]
        setChoice(next)
        saveThemeChoice(next)
      }}
      aria-label={`${LABEL[choice]}. Change theme`}
      title={LABEL[choice]}
      className="flex size-11 items-center justify-center rounded-full text-muted hover:text-foreground"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {choice === 'light' ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        ) : choice === 'dark' ? (
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        ) : (
          <>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" />
          </>
        )}
      </svg>
    </button>
  )
}
