# Viewers make ESPN roster moves from Sportsline, one confirmed tap at a time

The league page lists each Fantasy league's Available players (CONTEXT.md). Viewers want to act on what they find there: pick up a free agent, put in a waiver claim, drop someone to make room. Until now ESPN connections were read-only by Sportsline's choice (docs/adr/0004), not ESPN's: the stored `SWID` and `espn_s2` cookies are the Viewer's full ESPN session and could always make moves. This changes that choice for roster moves only. It doesn't change what's stored or how it's sealed.

**The moves.** In an ESPN league, a Viewer can, for their own team only:
- **add** a free agent, dropping one of their Players or not;
- **claim** a Player on waivers, with a drop or not, and a bid where the league uses a budget (FAAB);
- **drop** a Player.

Out of scope: lineup changes, trades, cancelling or reordering waiver claims (done on ESPN), and anything a league manager does for another team. Sleeper leagues stay look-only, since Sleeper has no API for moves.

**Opting in.** Moves are off until the Viewer turns them on for their ESPN connection. The setting explains that Sportsline will then use their ESPN session to change their rosters when they ask. Turning it on grants nothing new (the cookies already allow it), but a Viewer who connected for reading never finds Sportsline acting on ESPN unexpectedly. Disconnecting ESPN turns it off.

**Only the Viewer, only on a tap.** A move is made only by the Viewer's own request from the league page, in a server function behind their session. The Scheduler, ViewerSync and background syncs never make one, and Agents (docs/adr/0007) get no tool for it. If Agents ever propose moves, they'll follow docs/adr/0008: a proposal the Viewer approves.

**Confirming.** Tapping Add, Claim or Drop on a Player opens a sheet:
- the Player, and who to drop from the Viewer's roster (optional unless ESPN says the roster is full);
- the bid, in a budget league, with what's left of the budget;
- a summary in words ("Add Keegan Murray, drop Jordan Clarkson") and one Confirm button.

Nothing is sent before Confirm.

**Sending.** On Confirm, Sportsline:
1. Re-reads the league from ESPN, checking that the Player is still a free agent (or on waivers, for a claim) and that the Player to drop is still on the Viewer's team. If either has changed, it stops and says so.
2. Records the move under an id the page made when the sheet opened. A second Confirm for the same id (a double tap, a resend) finds it recorded and sends nothing.
3. Sends it once to ESPN's transactions endpoint (`POST lm-api-writes.fantasy.espn.com/apis/v3/games/{sport}/seasons/{season}/segments/0/leagues/{league}/transactions/`). The body gives the move's type (`FREEAGENT` or `WAIVER`), the Viewer's team and member id, the scoring period, the bid, and each Player added or dropped.
4. Never retries automatically, since a lost reply might mean the move went through.

ESPN enforces the league's own rules: roster limits, positions, Players whose Game has started, acquisition limits. Sportsline doesn't copy them; when ESPN refuses, its reason is shown.

**Outcomes.** Every move is kept with its result:
- **done:** an add or drop ESPN carried out;
- **pending:** a claim ESPN accepted, to be decided when the league's waivers run;
- **lost:** a claim another team won;
- **refused:** ESPN said no (a 4xx), with its reason; nothing changed;
- **unknown:** sent, but no answer came back (no reply, a timeout, a 5xx), so it may have gone through.

An unknown move is looked up at the league's next syncs, in the rosters they read: an add or drop is done once ESPN's rosters show it, and refused if they still don't after 15 minutes. A claim with no answer is taken as pending, since it may be waiting for waivers. A pending claim is followed the same way until it's won (done) or lost. A move still sending after 2 minutes lost its Worker and is treated as unknown. The Activity tab already shows what happened on ESPN, so a Viewer can always check there.

**Limits.** One move at a time per league, and at most 10 moves per Viewer per hour, so a bug or a stuck button can't churn a roster.

## Considered Options

- **Stay read-only and link out to ESPN.** The safest option, and nothing can go wrong in Sportsline. But the Viewer has to find the Player again in ESPN's app, which is what the Players tab was meant to save.
- **Moves on by default.** Simpler, but a Viewer who connected only to read would discover Sportsline could change their roster. Opting in costs one toggle.
- **Let Agents make moves within limits.** "Pick up the best streamer" is a natural ask. But a drop can't be undone: the dropped Player goes to waivers, where anyone can claim them. Moves stay with the Viewer; proposals could come later.
- **Retry a move with no answer.** It would get more moves through on a bad connection, but could make the same claim twice or drop a Player who'd already been replaced. Recording it as unknown and checking costs a few minutes.

## Consequences

- ADR 0004's "nothing it does changes a lineup or roster" no longer holds for Viewers who opt in. Everything else in 0004 stands. A leak of the database and the Worker secret was already a leak of sessions that could make moves; that risk is unchanged.
- The endpoint is ESPN's own and undocumented. If ESPN changes or blocks it, moves fail as refused or unknown, and the Players tab goes back to look-only until it's fixed. Reading isn't affected.
- A wrong drop can't be taken back from Sportsline, only reclaimed through waivers like any other Player. The fresh check and the Confirm sheet are the guard.
- Moves serve every Viewer with an ESPN connection, with no extra setup. Sleeper Viewers keep the Players tab without moves.
