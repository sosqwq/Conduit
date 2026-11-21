import { useEffect, useId, useRef, useState } from 'react'
import { chooseSkin, reduceMotion, skins, usePreferences, type Skin } from './preferences'
import './appearance.css'

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
          <span className="appearance-option"><span className="appearance-swatch" data-preview={key} aria-hidden="true" />
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
