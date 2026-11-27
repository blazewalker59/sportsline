import { SectionLabel } from '@/components/signal/Section'

/**
 * A titled section of a Player's (or Team's) page: Signal's section head
 * (the name in the label face, a hairline to the edge), with an optional
 * reading at the end of the rule.
 */
export function Section({
  title,
  index,
  aside,
  children,
}: {
  title: string
  index?: string
  aside?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section>
      <SectionLabel title={title} index={index}>
        {aside}
      </SectionLabel>
      {children}
    </section>
  )
}
