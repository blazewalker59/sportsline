/**
 * A page's content about a team (a Team's or Player's page): its crown
 * under the app header and its cards tinted, as a Sheet with a Subject
 * (styles.css, "Subject"). Without one, just its children.
 */

import type { Subject } from '@/lib/brand/subject'
import { subjectStyle } from '@/lib/brand/subject'

export function SubjectPage({
  subject,
  children,
}: {
  subject: Subject | null
  children: React.ReactNode
}) {
  if (!subject) return <>{children}</>
  return (
    <div className="subject subject-page" style={subjectStyle(subject)}>
      {/* Cards take the tint on a child: the tokens read the page's own. */}
      <div className="subject-cards">{children}</div>
    </div>
  )
}
