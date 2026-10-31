/**
 * Light and dark themes.
 *
 * The palette itself lives in src/app/globals.css: `.dark` on <html> swaps every
 * colour token, so components never branch on the theme. This file only decides
 * which class <html> carries.
 */

export type Theme = 'light' | 'dark'

/** localStorage key holding the visitor's explicit choice. No key = follow the OS. */
export const THEME_STORAGE_KEY = 'theme'

/**
 * Runs in <head> before the first paint. Applying the class from React would flash
 * the light page for a frame on every load for anyone who picked the dark theme.
 */
export const themeInitScript = `(function(){try{var s=localStorage.getItem('${THEME_STORAGE_KEY}');var d=s?s==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;var r=document.documentElement;r.classList.toggle('dark',d);r.style.colorScheme=d?'dark':'light'}catch(e){}})()`

export function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Private mode or blocked storage: the switch still works for this page view.
  }
}
