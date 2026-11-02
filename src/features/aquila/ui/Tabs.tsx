// Accessible tabs: arrow keys, Home and End move between tabs.
// Every panel stays mounted (hidden when inactive), so typed form input survives a tab switch.

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

export type TabItem = { id: string; label: ReactNode; content: ReactNode }

export function Tabs({ label, tabs, initialId }: { label: string; tabs: TabItem[]; initialId?: string }) {
  const [active, setActive] = useState(initialId ?? tabs[0]?.id)
  const base = useId()
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const tabId = (id: string) => `${base}-tab-${id}`
  const panelId = (id: string) => `${base}-panel-${id}`

  function onKeyDown(e: KeyboardEvent, index: number) {
    const last = tabs.length - 1
    const next =
      e.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
        : e.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
          : e.key === 'Home' ? 0
            : e.key === 'End' ? last
              : null
    if (next === null) return
    e.preventDefault()
    setActive(tabs[next].id)
    refs.current[next]?.focus()
  }

  return (
    <div className="space-y-5">
      <div role="tablist" aria-label={label} className="flex gap-1 border-b border-line">
        {tabs.map((t, i) => {
          const selected = t.id === active
          return (
            <button key={t.id} ref={(el) => { refs.current[i] = el }} type="button" role="tab"
              id={tabId(t.id)} aria-selected={selected} aria-controls={panelId(t.id)} tabIndex={selected ? 0 : -1}
              onClick={() => setActive(t.id)} onKeyDown={(e) => onKeyDown(e, i)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                selected ? 'border-accent text-accent' : 'border-transparent text-ink-3 hover:border-line hover:text-ink'}`}>
              {t.label}
            </button>
          )
        })}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" id={panelId(t.id)} aria-labelledby={tabId(t.id)} hidden={t.id !== active}
          tabIndex={0} className="focus-visible:outline-none">
          {t.content}
        </div>
      ))}
    </div>
  )
}
