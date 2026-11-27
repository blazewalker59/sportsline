# Signal: one orange that means live

Sportsline's look was "Watch Party": a blue accent, a gold for scores, green and red for results, a color per menu section, and floating glass navigation. Every screen was clear, but nothing about it was Sportsline's own, and color was spent everywhere, so nothing in particular stood out as happening now.

Signal (docs/design/signal.md, prototype docs/design/signal.html) replaces it, and these are the decisions that are hard to undo:

- **One orange, and it means live.** `--signal` (#ff4f00) lights what is happening now and what is the Viewer's own (their Starters, their Legs). Buttons, links and headings are ink. The old blue accent, gold scoring color and per-section colors are gone; the section tokens remain but are all ink, so code that names them keeps working. Green and red survive only for money and health (won, lost, stale), restrained. A future feature that wants a new color has to argue against this rule.
- **Three faces, self-hosted.** Inter for words, Space Mono for labels (every `uppercase` run, set in styles.css rather than in each component), and Doto, a dot-matrix face, for the number a screen is about. Doto's period and colon are crosses that read as "+", so the shipped file is rebuilt with plain dots and pinned to its one weight (scripts/fonts/doto-punctuation.py). Changing faces later means rebuilding that file, not patching components.
- **Solid material, no glass.** The navigation is an aluminum dock whose current key is pressed in and lit, not a blurred sheet. Depth comes from a lit top edge on panels and recessed wells. This drops backdrop-filter entirely, which also removes the cost of re-blurring on scroll.
- **Tokens first, then signature parts.** Screens kept their semantic classes (`bg-surface`, `text-live`), so the switch is mostly in styles.css; the parts that make it Signal (`Num`, `Meter`, `SectionLabel`, keys, lights) are shared components and classes rather than per-screen styling.
- **The mark is a status light.** An S on a 5×7 dot grid with one dot lit orange (components/signal/Logo.tsx); the favicon and app icons are generated from the same rows (scripts/icons.ts).

Considered and set aside: keeping Watch Party with a new logo (it would still not be ours), a team-color-led look (team colors already carry the feed, and a second system of meaning on top made scores and stakes harder to read), and a fully monochrome palette with no green or red (money needs an at-a-glance won/lost).
