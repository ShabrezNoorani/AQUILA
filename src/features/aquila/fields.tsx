// Small shared form controls. Each control is linked to its label via id.

import type { ReactNode } from 'react'

export const inputClass = 'w-full rounded-card border border-line bg-surface px-3 py-2 text-ink'

type FieldProps = {
  id: string
  label: ReactNode
  error?: string
  children: ReactNode
}

export function Field({ id, label, error, children }: FieldProps) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">{label}</label>
      {children}
      {error && <p role="alert" id={`${id}-error`} className="text-sm text-negative-deep">{error}</p>}
    </div>
  )
}

type TextProps = {
  id: string
  label: ReactNode
  value: string
  onChange: (v: string) => void
  error?: string
  multiline?: boolean
  placeholder?: string
  rows?: number
}

export function TextField({ id, label, value, onChange, error, multiline, placeholder, rows = 3 }: TextProps) {
  const common = {
    id,
    value,
    placeholder,
    className: inputClass,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `${id}-error` : undefined,
  }
  return (
    <Field id={id} label={label} error={error}>
      {multiline ? (
        <textarea {...common} rows={rows} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input {...common} type="text" onChange={(e) => onChange(e.target.value)} />
      )}
    </Field>
  )
}
