import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react'

/** A table inside a card-like frame. Use with Th and Td. */
export function Table({ children, className = '', ...rest }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-surface shadow-sm shadow-ink/5">
      <table className={`w-full border-collapse text-left text-sm ${className}`.trim()} {...rest}>{children}</table>
    </div>
  )
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="border-b border-line bg-paper/60 text-xs font-medium uppercase tracking-wide text-ink-3">{children}</thead>
}

export function Th({ className = '', ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={`px-4 py-2.5 font-medium ${className}`.trim()} {...rest} />
}

/** A body row with a divider and hover tint. */
export function Tr({ className = '', ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={`border-t border-line first:border-t-0 hover:bg-paper/60 ${className}`.trim()} {...rest} />
}

export function Td({ className = '', ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={`px-4 py-3 align-middle text-ink ${className}`.trim()} {...rest} />
}
