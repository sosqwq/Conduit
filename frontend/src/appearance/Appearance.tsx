import { useEffect, useId, useRef, useState } from 'react'
import { chooseSkin, reduceMotion, skins, usePreferences, type Skin } from './preferences'
import './appearance.css'

function Swatch({ skin }: { skin: Skin }) {
  return <svg aria-hidden="true" className="appearance-swatch" viewBox="0 0 64 42" fill="none">
    {skin === 'grove' && <>
      <rect width="64" height="42" fill="#d8dfc8" /><circle cx="46" cy="9" r="5" fill="#faf0c9" />
      <path d="m0 30 18-19 9 10L40 8l24 22v12H0Z" fill="#9caf92" />
      <path d="M0 26 14 15l18 14 14-11 18 12v12H0Z" fill="#6b8a74" />
      <path d="m0 34 20-11 16 10 13-7 15 8v8H0Z" fill="#355447" />
      <path d="M3 40c14-7 20-3 26-7s15-3 23-7" stroke="#9bb193" strokeWidth=".9" />
    </>}
    {skin === 'dusk' && <>
      <rect width="64" height="42" fill="#20283d" /><circle cx="46" cy="12" r="7" fill="#e8d7aa" />
      <circle cx="49" cy="10" r="6.5" fill="#20283d" />
      <path d="m6 14 9-6 9 8 8-5" stroke="#939abc" strokeWidth=".65" />
      <path d="M0 34 20 21l14 10 13-9 17 10v10H0Z" fill="#494967" />
      <path d="m0 34 11-5 14 6 11-7 19 8 9-5v11H0Z" fill="#323449" />
      <g fill="#ede2c9"><circle cx="6" cy="14" r="1.1" /><circle cx="15" cy="8" r="1.3" />
        <circle cx="24" cy="16" r="1" /><circle cx="32" cy="11" r="1.15" /><circle cx="56" cy="18" r=".8" /></g>
    </>}
    {skin === 'dune' && <>
      <rect width="64" height="42" fill="#f0cd9f" /><circle cx="43" cy="10" r="5" fill="#fff0ce" />
      <path d="M0 32C10 27 14 14 26 14c12 0 16 12 38 8v20H0Z" fill="#d69a70" />
      <path d="M0 36C20 34 25 18 37 19c10 0 17 8 27 7v16H0Z" fill="#b87050" />
      <path d="M0 35c18-11 31-7 42-2 10 5 15 3 22 0v9H0Z" fill="#94513e" />
      <path d="M1 36c22-12 33-5 41-2" stroke="#dc9f76" strokeWidth=".9" />
    </>}
  </svg>
}

export function Appearance() {
  const { skin, reduceMotion: reduced, systemReducesMotion } = usePreferences()
  const [open, setOpen] = useState(false)
  const wrapper = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    wrapper.current?.querySelector<HTMLInputElement>('input[type="radio"]:checked')?.focus()
    const dismissOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !wrapper.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', dismissOutside)
    return () => document.removeEventListener('pointerdown', dismissOutside)
  }, [open])

  return <div ref={wrapper} className="appearance" onKeyDown={event => {
    if (open && event.key === 'Escape') {
      event.stopPropagation()
      setOpen(false)
      trigger.current?.focus()
    }
  }} onBlur={event => {
    if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) setOpen(false)
  }}>
    <button type="button" ref={trigger} className="appearance-trigger" aria-label="Appearance"
      aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(value => !value)}>
      <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3a9 9 0 0 0 0 18h1.1a2.2 2.2 0 0 0 1.5-3.8 1.5 1.5 0 0 1 1-2.6h1.6c2.5 0 3.8-1.9 3.8-4A7.7 7.7 0 0 0 12 3Z" />
        <g fill="currentColor" stroke="none"><circle cx="7.8" cy="10.5" r="1.2" /><circle cx="11.3" cy="7.4" r="1.2" /><circle cx="16" cy="8.4" r="1.2" /></g>
      </svg><span className="appearance-trigger-text">Appearance</span>
    </button>
    {open && <div id={id} className="appearance-panel">
      <div className="appearance-title">Appearance</div>
      <fieldset className="appearance-choices"><legend className="appearance-hidden">Color theme</legend>
        {(Object.keys(skins) as Skin[]).map(key => <label key={key} className="appearance-choice">
          <input type="radio" name={`${id}-skin`} checked={skin === key}
            aria-labelledby={`${id}-${key}`} onChange={() => chooseSkin(key)} />
          <span className="appearance-option"><Swatch skin={key} />
            <span className="appearance-option-text"><span id={`${id}-${key}`} lang="zh-CN">{skins[key].title}</span>
              <small>{skins[key].subtitle}</small></span>
            <span className="appearance-indicator" aria-hidden="true"><svg viewBox="0 0 12 12" fill="none"><path d="m2.5 6.3 2.2 2.2L9.5 3.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
          </span>
        </label>)}
      </fieldset>
      <label className="appearance-motion"><input type="checkbox" checked={reduced || systemReducesMotion}
        disabled={systemReducesMotion} aria-labelledby={`${id}-motion`} onChange={event => reduceMotion(event.target.checked)} />
        <span><span id={`${id}-motion`}>Reduce motion</span>{systemReducesMotion && <small>Enabled by your device</small>}</span>
        <span className="appearance-switch" aria-hidden="true" />
      </label>
    </div>}
  </div>
}
