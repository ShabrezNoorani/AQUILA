// A company name box with suggestions from existing companies (a native datalist).
// Any name can be typed; it is matched to an existing company, ignoring case and spaces, when saved.

import type { Company } from '../types'
import { Field, inputClass } from '../ui'

type Props = {
  id: string
  label: string
  value: string
  companies: Company[]
  onChange: (value: string) => void
  help?: string
  error?: string
  disabled?: boolean
}

export default function CompanyField({ id, label, value, companies, onChange, help, error, disabled }: Props) {
  const listId = `${id}-suggestions`
  return (
    <Field id={id} label={label} help={help} error={error}>
      <input id={id} className={inputClass} value={value} list={listId} autoComplete="off" disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={[help ? `${id}-help` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined}
        onChange={(e) => onChange(e.target.value)} />
      <datalist id={listId}>
        {companies.map((c) => <option key={c.id} value={c.name}>{c.is_own ? 'OWN' : undefined}</option>)}
      </datalist>
    </Field>
  )
}
