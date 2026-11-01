import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SubjectPage } from '@/components/brand/SubjectPage'
import { TeamPip } from '@/components/brand/TeamPip'
import { teamSubject } from '@/lib/brand/subject'

const LIONS = { primary: '#0076b6', secondary: '#b0b7bc' }

describe('SubjectPage', () => {
  it('wears its team: a crown, colors, and tinted cards on a child', () => {
    const html = renderToStaticMarkup(
      <SubjectPage subject={teamSubject(LIONS)}>
        <p>Body</p>
      </SubjectPage>,
    )
    expect(html).toContain('class="subject subject-page"')
    expect(html).toContain('--s-light:#0076b6')
    expect(html).toContain('<div class="subject-cards"><p>Body</p></div>')
  })

  it('is just its children without a Subject', () => {
    expect(
      renderToStaticMarkup(
        <SubjectPage subject={null}>
          <p>Body</p>
        </SubjectPage>,
      ),
    ).toBe('<p>Body</p>')
  })
})

describe('TeamPip', () => {
  it('marks a team in its color', () => {
    const html = renderToStaticMarkup(
      <TeamPip colors={LIONS} className="size-1.5" />,
    )
    expect(html).toContain('subject subject-pip')
    expect(html).toContain('size-1.5')
    expect(html).toContain('--s-light:#0076b6')
    expect(html).toContain('aria-hidden="true"')
  })

  it('draws nothing without colors', () => {
    expect(renderToStaticMarkup(<TeamPip colors={null} />)).toBe('')
  })
})
