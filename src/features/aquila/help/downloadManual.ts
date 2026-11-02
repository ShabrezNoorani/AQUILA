// Saves the AQUILA manual to the user's computer. No packages: a Blob and a temporary link.

import manual from './AQUILA-Manual.md?raw'

export const MANUAL_FILE_NAME = 'AQUILA-Manual.md'

/** Saves the manual text as AQUILA-Manual.md. */
export function downloadManual(text: string = manual) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = MANUAL_FILE_NAME
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
