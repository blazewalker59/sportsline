# Sportsline

A live, livestream-style timeline of play-by-play across the sports a viewer cares about, with filtering and drill-in to full game and play detail. This glossary defines the domain language; it is not a spec.

## Language

### Leagues & Sources

**League**:
One of the professional competitions Sportsline covers: MLB, NBA, NFL, NHL. College and other leagues are out of scope.
_Avoid_: sport (a sport can span several leagues)

**Source**:
An external provider of live game data for a League. Each League has exactly one Source at a time, and Source-specific shapes never leak past the boundary into the shared model.
_Avoid_: feed, API, provider

### Plays

**Play**:
The single unit that appears on the timeline, sized to each League's natural unit: a plate appearance or a game-relevant action during one, such as a stolen base, pickoff, wild pitch, balk, pitching change or substitution (MLB), a snap including penalties and timeouts (NFL), or a single game event such as a shot, foul, rebound, substitution or timeout (NBA, NHL). Drives, innings and possessions are groupings of Plays, never Plays themselves.
_Avoid_: event, action, update

**Involved Player**:
A player named in a Play (batter, pitcher, shooter, rebounder, passer, tackler, etc.). Merely being on the field or ice does not make a player involved.

**Significance**:
How much a Play matters, assigned per League: Scoring (changes the score), Notable (momentum or game-state moments that don't score, such as turnovers, ejections, lead changes), or Routine (everything else).
_Avoid_: priority, importance, weight

**Clutch**:
A close Game in its final stretch (e.g. last minutes of the 4th quarter or 3rd period, 9th inning onward), during which Routine Plays are promoted to Notable. Each League defines its own Clutch threshold.
_Avoid_: crunch time, late game

**Play Type**:
A League-specific category of Play (e.g. home run, strikeout, three-pointer, sack, power-play goal) that a Viewer can filter by.

**Pitch**:
A single pitch within an MLB plate appearance. Pitches are detail inside a Play, never Plays themselves.

**Revision**:
A Source's change to the facts of an existing Play (e.g. a hit rescored as an error, a two scored as a three). The Play keeps its place on the Timeline and is marked as updated.
_Avoid_: edit, correction

**Overturn**:
A Revision that undoes a scoring or game-changing outcome (e.g. a touchdown reversed on review, a goal disallowed after a challenge). Unlike a Revision, it surfaces as a new item at the top of the Timeline, while the original Play stays visible, struck through.
_Avoid_: reversal, reversed play

**Removal**:
A Source deleting a Play entirely (e.g. a duplicate or phantom entry). The Play disappears from the Timeline without trace.

### Games

**Team**:
A franchise in a League, identified by Sportsline's own identity. A relocated or renamed franchise is the same Team.
_Avoid_: club, franchise, squad

**Player**:
An athlete in a League, identified by Sportsline's own identity independent of any Source and of the Team they currently play for.
_Avoid_: athlete

**Game**:
A single scheduled contest between two Teams in a League. Plays always belong to exactly one Game.
_Avoid_: match, event, contest

**Situation**:
A live Game's current state between Plays: score, segment, clock or outs, and League-specific context (count and runners in MLB, down and distance in NFL, strength in NHL, possession in NBA). The Situation belongs to the Game and is never a Timeline item; Plays appear on the Timeline only once complete.
_Avoid_: game state, live state

**Game Milestone**:
A change in a Game's state, rather than an on-field action, that appears on the Timeline alongside Plays: start, end of a segment (inning, period, quarter, half), final, delay or suspension, and postponement.
_Avoid_: status update, game event

**Game Detail**:
The drill-in view of one Game: scoreboard, linescore, box score, and every Play grouped by the League's natural segment (drive, half-inning, period, quarter).

**Play Detail**:
The drill-in view of one Play: its game-state context at that moment, League-specific specifics (Pitches, field position, shot location), and each Involved Player's in-game stats as of that Play.

### Interests

**Follow**:
A viewer's declared interest in a Team, Player or League. A Team Follow covers every Play in that Team's Games (both sides); a Player Follow covers only Plays where that player is an Involved Player; a League Follow covers every Play in that League.
_Avoid_: subscription, favorite, watch

**Timeline**:
The live, reverse-chronological stream of Plays and Game Milestones matching a viewer's Follows, deduplicated, then narrowed by any active filters.
_Avoid_: feed, stream, ticker

**Sports Day**:
The calendar day a Game belongs to for display, rolling over at 6am Eastern so late West Coast Games count toward the evening they started. The Timeline opens on today's Sports Day.
_Avoid_: date, game day

**Read Marker**:
A Viewer's position on the Timeline when they last stopped reading, shown as a "you were here" divider when they return.
_Avoid_: bookmark, last seen

**Viewer**:
A person signed in to Sportsline, who owns a set of Follows. Signed-out visitors see a default Timeline and have no Follows.
_Avoid_: user, account, member
