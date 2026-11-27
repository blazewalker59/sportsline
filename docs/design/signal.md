# Signal: Sportsline's design language

Sportsline as a piece of hardware: aluminum and ink, labels like a manual,
and one orange light that means **live**. Dots draw the mark and progress,
never numbers. The
interactive prototype is `docs/design/signal.html` (open it in a browser):
every screen below has a reference there.

## Rules

1. **Orange means live, or yours.** The lit orange (`--signal`, `bg-signal`,
   `.led`) is for what is happening now (a live Game, the Play just made, a
   Starter in play) and for the Viewer's own stake in it (their Starter, their
   Leg). Nothing else is orange: not buttons, not links, not headings, not
   decoration. `text-live` / `text-scoring` / `text-in-play` are the same
   orange, deepened for text contrast.
2. **Numbers in heavy Inter, never in dots.** The figure a screen is about
   (a score, a clock, a portfolio's worth, a Matchup's points, a win chance)
   is set with `<Num>`: Inter at its heaviest, tightly set, tabular. Tables,
   stat lines and running text are Inter too, at their usual weights. The
   dot matrix is for the mark and wordmark, and for progress (segmented
   meters, the countdown ring): never a number or a score.
3. **Label everything the way a manual would.** Small uppercase labels are
   Space Mono automatically (`.uppercase` in styles.css sets the face):
   `text-3xs text-muted uppercase`. Section heads use `<SectionLabel>`, with
   an index ("A1") on the main screens.
4. **Every control could be a physical one.** Buttons are keys (`.key`): a
   raised cap that presses in. The current choice is a pressed key or a lit
   one, never a blue fill. Toggles and segmented choices sit in a recessed
   `.well`.
5. **Team color is data.** Teams keep their colors as small square chips,
   edges and the Subject crowns, never as large fills of text-bearing
   surfaces (except where the existing team-tint wash already lives).
6. **Solid material.** No glass or blur. Depth comes from a lit top edge
   (`.panel`, automatic on `bg-surface rounded-card`) and recessed wells.

## Tokens (src/styles.css)

| Token | Light (aluminum) | Graphite | Use |
|---|---|---|---|
| `background` | #e9e8e3 | #111111 | The page |
| `surface` | #f5f4ef | #1a1a1a | Panels (cards) |
| `notice` | #dcdbd4 | #0b0b0b | Wells (recessed) |
| `border` | #d6d5ce | #262626 | Hairlines |
| `foreground` | #121212 | #ecebe6 | Ink |
| `muted` | #64635d | #8f8e88 | Secondary ink |
| `accent` | ink | ink | Focus ring, links (underline them) |
| `signal` | #ff4f00 | #ff4f00 | Lights, meters, lit keys (fill only) |
| `live`, `scoring`, `in-play` | #b33600 | #ff6a2b | Orange text |
| `notable` | #3b3b38 | #c4c3bd | Secondary emphasis |
| `positive` / `negative` / `warning` | restrained green / wine / mustard | lighter | Money and health only |

Ink on lit orange is 5.7:1; white on it is not legible. Text on `bg-signal`
is `text-[#121212]`.

Radii: `rounded-control` 10px (keys, chips), `rounded-card` 18px (panels),
`rounded-sheet` 28px, `rounded-full` for lights and pills.

## Faces

- **Inter** (`font-sans`, the default): everything you read.
- **Space Mono** (`font-label` / `font-mono`): labels, captions, clocks in
  running text, the nav. Every `uppercase` run gets it automatically.
- **Doto** (`font-dots`): the wordmark only. Never numbers or scores.
  (Its punctuation is redrawn, scripts/fonts/doto-punctuation.py, in case a
  future mark needs it.)
- **Numbers:** `<Num>` sets heavy Inter with tabular figures. Units go in
  `unit`: `<Num unit="%">64</Num>`, `<Num unit="¢">64</Num>`.

## Parts

| Part | Where | Use |
|---|---|---|
| `<Num>` | `components/signal/Num.tsx` | The figure a screen is about, in heavy Inter |
| `<Meter value label segments?>` | `components/signal/Meter.tsx` | Win chance, projection pace, Progress, Odds |
| `<SectionLabel title index?>` | `components/signal/Section.tsx` | Section heads |
| `<Segmented label value options onChange>` | `components/signal/Segmented.tsx` | A choice of a few: keys in a well, the current one pressed (a radio group) |
| `<Mark>`, `<Wordmark>` | `components/signal/Logo.tsx` | Brand |
| `.key`, `.key-on`, `.key-ink` | styles.css | Buttons. `.key-ink` is the one primary action on a screen (Approve, Cash out) |
| `.led`, `.led-pulse`, `.led-off`, `.led-ink` | styles.css | Status lights. Pulse only for live |
| `.well` | styles.css | Recessed: segmented controls, readouts, inputs |
| `.panel` | styles.css | A raised card (automatic on `bg-surface rounded-card`) |

Typical key: `key inline-flex h-9 items-center justify-center gap-1.5 rounded-control px-3 text-3xs font-bold uppercase`.
A key that is the current choice: add `aria-pressed="true"` (pressed in) and
optionally `key-on` for a lit one (use sparingly: lit is orange, so live).

Glyphs for state, monochrome: `●` scored / won, `◐` pending / notable, `○`
routine / lost-unlit. Up and down: `▲` `▼` with `text-positive` /
`text-negative` for money only.

## Surfaces

- **Home board / hero** (Timeline, Predictions, Fantasy): a panel with a
  label row (a pulsing `.led` when live, the context in the label face), the
  one `<Num>` figure (or two, side by side for a score), and a `<Meter>` under
  it with a label row beneath (BOS · Knicks win chance 64% · NYK).
- **Game tiles**: panel, label row (light + League, clock), two rows team
  chip + abbreviation + `<Num>` score; the losing side muted.
- **Feed (Timeline)**: the chat bubbles stay (they are the product), drawn
  as panels: hairline, the lit top edge, team-tint wash kept faint. A Scoring
  Play's card is ink-inverted (foreground fill, background text) with an
  orange light, not a team-color fill. Stake tags are orange text with a dot
  for the Viewer's own, muted for an opponent's.
- **Lists**: hairline-separated rows, an index or glyph column on the left
  where it helps.
- **Sheets and menus**: solid `surface`, `rounded-sheet`, a lit top edge.
- **Empty and error states**: a well with a label and one key.

## Verifying

`bun run ci` must pass. Check both themes (the moon/sun button, or
`document.documentElement.classList.toggle('dark')`). Locally, `bun run dev`
with a `.dev.vars`; see the PR for the local sign-in.
