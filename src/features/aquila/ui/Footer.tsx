/** The one footer used on every AQUILA screen: a hairline, then a centred muted line. */
export function Footer({ className = '' }: { className?: string }) {
  return (
    <footer className={`border-t border-line px-6 py-5 text-center text-xs font-medium tracking-[0.2em] text-ink-3 ${className}`.trim()}>
      MADE IN PARIS · © 2026
    </footer>
  )
}
