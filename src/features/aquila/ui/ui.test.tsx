import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { AppShell, Badge, Button, ButtonLink, Card, ConfirmDialog, EmptyState, Page, Table, Tabs, Td, TextField, Th, THead, Tr } from '.'

describe('AppShell', () => {
  it('shows Listings, Tags and Ask AI, and marks the current page', () => {
    render(<AppShell active="tags"><p>body</p></AppShell>)
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(within(nav).getByRole('link', { name: 'Listings' }).getAttribute('href')).toBe('#/')
    const tags = within(nav).getByRole('link', { name: 'Tags' })
    expect(tags.getAttribute('href')).toBe('#/tags')
    expect(tags.getAttribute('aria-current')).toBe('page')
    expect(within(nav).getByRole('link', { name: 'Listings' }).getAttribute('aria-current')).toBeNull()
    expect(screen.getByText('body')).toBeTruthy()
  })

  it('links Ask AI to #/ask like the other items, with no "Soon" label', () => {
    render(<AppShell active="listings"><p /></AppShell>)
    const nav = screen.getByRole('navigation', { name: 'Main' })
    const ask = within(nav).getByRole('link', { name: 'Ask AI' })
    expect(ask.getAttribute('href')).toBe('#/ask')
    expect(ask.getAttribute('aria-current')).toBeNull()
    expect(ask.className).toBe(within(nav).getByRole('link', { name: 'Tags' }).className)
    expect(within(nav).queryByText('Soon')).toBeNull()
    expect(nav.querySelector('[aria-disabled]')).toBeNull()
  })

  it('lists Help after Ask AI, linking to #/help', () => {
    render(<AppShell active="listings"><p /></AppShell>)
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(within(nav).getAllByRole('link').map((l) => l.textContent)).toEqual(['Listings', 'Tags', 'Ask AI', 'Help'])
    const help = within(nav).getByRole('link', { name: 'Help' })
    expect(help.getAttribute('href')).toBe('#/help')
    expect(help.className).toBe(within(nav).getByRole('link', { name: 'Tags' }).className)
  })

  it('marks Help as the current page when active is help', () => {
    render(<AppShell active="help"><p /></AppShell>)
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(within(nav).getByRole('link', { name: 'Help' }).getAttribute('aria-current')).toBe('page')
  })

  it('marks Ask AI as the current page when active is ask', () => {
    render(<AppShell active="ask"><p /></AppShell>)
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(within(nav).getByRole('link', { name: 'Ask AI' }).getAttribute('aria-current')).toBe('page')
  })
})

describe('Page', () => {
  it('puts the title in an h1 top bar with actions and a back link', () => {
    render(<Page title="Listings" back={{ href: '#/', label: '← All listings' }} actions={<Button>Go</Button>}>x</Page>)
    expect(screen.getByRole('heading', { level: 1, name: 'Listings' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Go' })).toBeTruthy()
    expect(screen.getByRole('link', { name: '← All listings' }).getAttribute('href')).toBe('#/')
  })
})

describe('Button', () => {
  it('is type="button" unless told otherwise, so it never submits by accident', () => {
    const submit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault())
    render(<form onSubmit={submit}><Button>Plain</Button><Button type="submit" variant="primary">Send</Button></form>)
    fireEvent.click(screen.getByRole('button', { name: 'Plain' }))
    expect(submit).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(submit).toHaveBeenCalledTimes(1)
  })

  it('has distinct primary, secondary and danger looks, and a link variant', () => {
    render(<><Button variant="primary">P</Button><Button>S</Button><Button variant="danger">D</Button><ButtonLink href="#/x">L</ButtonLink></>)
    const cls = (name: string) => screen.getByRole(name === 'L' ? 'link' : 'button', { name }).className
    expect(cls('P')).toContain('bg-accent')
    expect(cls('S')).toContain('bg-surface')
    expect(cls('D')).toContain('text-negative-deep')
    expect(cls('L')).toContain('rounded-card')
  })
})

describe('TextField', () => {
  it('links label, help and error to the input', () => {
    render(<TextField id="f" label="Name *" value="" onChange={() => {}} help="Shown on the page." error="Name is required" />)
    const input = screen.getByLabelText('Name *')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.getAttribute('aria-describedby')).toBe('f-help f-error')
    expect(screen.getByText('Shown on the page.').id).toBe('f-help')
    expect(screen.getByRole('alert').textContent).toBe('Name is required')
  })

  it('has no aria-describedby without help or error', () => {
    render(<TextField id="g" label="URL" value="" onChange={() => {}} />)
    expect(screen.getByLabelText('URL').getAttribute('aria-describedby')).toBeNull()
  })
})

describe('ConfirmDialog', () => {
  const setup = (onConfirm = vi.fn(async () => {})) => {
    const onCancel = vi.fn()
    render(<ConfirmDialog label="Confirm delete thing" message="Delete it?" confirmLabel="Yes, delete" onConfirm={onConfirm} onCancel={onCancel} />)
    return { onConfirm, onCancel, dialog: screen.getByRole('alertdialog', { name: 'Confirm delete thing' }) }
  }

  it('is a modal alert dialog that starts focused on Cancel', () => {
    const { dialog } = setup()
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancel' }))
  })

  it('cancels on Escape and on the backdrop, without confirming', () => {
    const { onCancel, onConfirm, dialog } = setup()
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.mouseDown(dialog.parentElement!)
    expect(onCancel).toHaveBeenCalledTimes(2)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('does not cancel on a click inside the box', () => {
    const { onCancel, dialog } = setup()
    fireEvent.mouseDown(dialog)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('shows the error inside the dialog when confirming fails', async () => {
    const { dialog } = setup(vi.fn(async () => { throw new Error('locked') }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, delete' }))
    expect((await within(dialog).findByRole('alert')).textContent).toBe('Could not delete: locked')
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Yes, delete' })).toBeTruthy())
  })
})

describe('Tabs', () => {
  const tabs = [
    { id: 'a', label: 'One', content: <input aria-label="kept" defaultValue="" /> },
    { id: 'b', label: 'Two', content: <p>second</p> },
    { id: 'c', label: 'Three', content: <p>third</p> },
  ]

  it('shows only the selected panel and switches on click', () => {
    render(<Tabs label="Sections" tabs={tabs} />)
    expect(screen.getByRole('tab', { name: 'One' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tabpanel', { name: 'One' })).toBeTruthy()
    expect(screen.queryByRole('tabpanel', { name: 'Two' })).toBeNull()
    expect(screen.getByText('second').closest('[role=tabpanel]')!.hasAttribute('hidden')).toBe(true)
    fireEvent.click(screen.getByRole('tab', { name: 'Two' }))
    expect(screen.getByRole('tabpanel', { name: 'Two' }).textContent).toBe('second')
  })

  it('keeps hidden panels mounted, so typed input survives a switch', () => {
    render(<Tabs label="Sections" tabs={tabs} />)
    fireEvent.change(screen.getByLabelText('kept'), { target: { value: 'typed' } })
    fireEvent.click(screen.getByRole('tab', { name: 'Two' }))
    fireEvent.click(screen.getByRole('tab', { name: 'One' }))
    expect((screen.getByLabelText('kept') as HTMLInputElement).value).toBe('typed')
  })

  it('moves with arrow keys, Home and End, wrapping around', () => {
    render(<Tabs label="Sections" tabs={tabs} />)
    const tab = (name: string) => screen.getByRole('tab', { name })
    fireEvent.keyDown(tab('One'), { key: 'ArrowLeft' })
    expect(tab('Three').getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tab('Three'))
    fireEvent.keyDown(tab('Three'), { key: 'ArrowRight' })
    expect(tab('One').getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(tab('One'), { key: 'End' })
    expect(tab('Three').getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(tab('Three'), { key: 'Home' })
    expect(tab('One').getAttribute('aria-selected')).toBe('true')
    expect(tab('Two').getAttribute('tabindex')).toBe('-1')
  })
})

describe('Card, Badge, Table and EmptyState', () => {
  it('render their content', () => {
    render(
      <>
        <Card title="Details" description="About it" actions={<Button>Act</Button>}>inside</Card>
        <Badge tone="positive">Active</Badge>
        <Table><THead><tr><Th>Name</Th></tr></THead><tbody><Tr><Td>Row</Td></Tr></tbody></Table>
        <EmptyState title="No listings yet." action={<Button>Start</Button>} />
      </>,
    )
    expect(screen.getByRole('heading', { name: 'Details' })).toBeTruthy()
    expect(screen.getByText('inside')).toBeTruthy()
    expect(screen.getByText('Active').className).toContain('text-positive-deep')
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeTruthy()
    expect(screen.getByRole('cell', { name: 'Row' })).toBeTruthy()
    expect(screen.getByText('No listings yet.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy()
  })
})
