/** A titled section of a Player's (or Team's) page. */
export function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">
        {title}
      </h2>
      {children}
    </section>
  )
}
