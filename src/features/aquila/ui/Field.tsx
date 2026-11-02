// Form fields: a label, the control, optional help text, and an error.
// Each control is linked to its label by id; help and error are linked by aria-describedby.

import type { ReactNode } from 'react'

export const inputClass =
  'block w-full rounded-card border border-line bg-surface px-3 py-2 text-sm text-ink shadow-sm shadow-ink/5 ' +
  'placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/20 ' +
  'disabled:bg-paper disabled:text-ink-3 aria-[invalid=true]:border-negative'

const describedBy = (id: string, help?: ReactNode, error?: string) =>
  [help ? `${id}-help` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined

type FieldProps = {
  id: string
  label: ReactNode
  help?: ReactNode
  error?: string
  children: ReactNode
}

export function Field({ id, label, help, error, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-ink">{label}</label>
      {children}
      {help && <p id={`${id}-help`} className="text-xs text-ink-3">{help}</p>}
      {error && <p role="alert" id={`${id}-error`} className="text-sm text-negative-deep">{error}</p>}
    </div>
  )
}

type TextProps = {
  id: string
  label: ReactNode
  value: string
  onChange: (v: string) => void
  help?: ReactNode
  error?: string
  multiline?: boolean
  placeholder?: string
  rows?: number
  className?: string
}

export function TextField({ id, label, value, onChange, help, error, multiline, placeholder, rows = 3, className = '' }: TextProps) {
  const common = {
    id,
    value,
    placeholder,
    className: `${inputClass} ${className}`.trim(),
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy(id, help, error),
  }
  return (
    <Field id={id} label={label} help={help} error={error}>
      {multiline ? (
        <textarea {...common} rows={rows} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input {...common} type="text" onChange={(e) => onChange(e.target.value)} />
      )}
    </Field>
  )
}

/** A form-level message, e.g. "Could not save: …". Rendered as an alert. */
export function FormError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-card border border-negative/25 bg-negative/8 px-3 py-2 text-sm text-negative-deep">
      {children}
    </p>
  )
}
