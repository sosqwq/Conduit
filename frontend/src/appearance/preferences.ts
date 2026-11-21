import { useSyncExternalStore } from 'react'

export const skins = {
  grove: { title: '山野手记', subtitle: 'Woodland journal' },
  dusk: { title: '午夜星图', subtitle: 'Midnight atlas' },
  dune: { title: '赤陶沙丘', subtitle: 'Terracotta dunes' },
} as const

export type Skin = keyof typeof skins
interface Preferences {
  skin: Skin
  reduceMotion: boolean
  systemReducesMotion: boolean
}

const skinKey = 'conduit.skin'
const motionKey = 'conduit.reduceMotion'
const listeners = new Set<() => void>()
let media: MediaQueryList | undefined
let preferences: Preferences = { skin: 'grove', reduceMotion: false, systemReducesMotion: false }

function apply(next: Preferences) {
  const root = document.documentElement
  root.dataset.skin = next.skin
  root.dataset.motion = next.reduceMotion || next.systemReducesMotion ? 'reduced' : 'full'
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  const color = meta?.dataset[next.skin]
  if (meta && color) meta.content = color
  if (next.skin === preferences.skin && next.reduceMotion === preferences.reduceMotion &&
      next.systemReducesMotion === preferences.systemReducesMotion) return
  preferences = next
  listeners.forEach(listener => listener())
}

function restore() {
  let { skin, reduceMotion } = preferences
  try {
    const stored = localStorage.getItem(skinKey)
    skin = stored === 'dusk' || stored === 'dune' ? stored : 'grove'
    reduceMotion = localStorage.getItem(motionKey) === 'true'
  } catch { /* Keep the current tab's preferences if storage is unavailable. */ }
  apply({ skin, reduceMotion, systemReducesMotion: media?.matches ?? false })
}

function onStorage(event: StorageEvent) {
  if (event.storageArea && event.storageArea !== window.localStorage) return
  if (event.key === skinKey || event.key === motionKey || event.key === null) restore()
}

function onSystemChange() {
  apply({ ...preferences, systemReducesMotion: media?.matches ?? false })
}

function subscribe(listener: () => void) {
  if (!listeners.size) {
    media = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    media?.addEventListener('change', onSystemChange)
    window.addEventListener('storage', onStorage)
    restore()
  }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (!listeners.size) {
      media?.removeEventListener('change', onSystemChange)
      window.removeEventListener('storage', onStorage)
    }
  }
}

export function chooseSkin(skin: Skin) {
  try { localStorage.setItem(skinKey, skin) } catch { /* Apply for this tab. */ }
  apply({ ...preferences, skin })
}

export function reduceMotion(value: boolean) {
  try { localStorage.setItem(motionKey, String(value)) } catch { /* Apply for this tab. */ }
  apply({ ...preferences, reduceMotion: value })
}

export function usePreferences() {
  return useSyncExternalStore(subscribe, () => preferences)
}
