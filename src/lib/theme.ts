/**
 * Light/dark theme: the Viewer's choice in this browser, else the device's.
 * Applied before paint by the inline script in __root.tsx (THEME_BOOT), so
 * a dark-mode Viewer never sees a light flash.
 */

export type ThemeChoice = 'system' | 'light' | 'dark'

export const THEME_KEY = 'sportsline.theme'

export function readThemeChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(THEME_KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

export function applyTheme(choice: ThemeChoice): void {
  const dark =
    choice === 'dark' ||
    (choice === 'system' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', dark ? '#0e1015' : '#f3f4f8')
}

export function saveThemeChoice(choice: ThemeChoice): void {
  try {
    if (choice === 'system') localStorage.removeItem(THEME_KEY)
    else localStorage.setItem(THEME_KEY, choice)
  } catch {
    // Storage unavailable (private mode): the choice lasts for this page.
  }
  applyTheme(choice)
}

/** Runs inline in <head> before first paint. */
export const THEME_BOOT = `(function(){try{var t=localStorage.getItem('${THEME_KEY}');var d=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark')}catch(e){}})();`
