import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { WhoHasSwitch } from '@/components/fantasy/WhoHasSwitch'

function html(on: boolean) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <WhoHasSwitch leagueId="l1" on={on} />
    </QueryClientProvider>,
  )
}

describe('WhoHasSwitch', () => {
  it('reads off until the Viewer opts the league in', () => {
    const off = html(false)
    expect(off).toContain('role="switch"')
    expect(off).toContain('aria-checked="false"')
    expect(off).toContain('Off. Turn on')
  })

  it('reads on once the league is opted in', () => {
    const on = html(true)
    expect(on).toContain('aria-checked="true"')
    expect(on).toContain('On. When a notable player')
  })
})
