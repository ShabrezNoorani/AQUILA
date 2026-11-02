// #/help: the AQUILA manual, shown as plain text with its line breaks, and a download button.
// The manual is imported as raw text at build time; no markdown package is used.

import manual from './AQUILA-Manual.md?raw'
import { Button, Card, Page } from '../ui'
import { downloadManual } from './downloadManual'

export default function HelpPage() {
  return (
    <Page title="Help" narrow
      actions={<Button variant="primary" onClick={() => downloadManual()}>Download manual</Button>}>
      <Card as="article" aria-label="AQUILA manual">
        <div className="mx-auto max-w-prose whitespace-pre-wrap break-words text-sm leading-relaxed text-ink">
          {manual}
        </div>
      </Card>
    </Page>
  )
}
