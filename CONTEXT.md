# Sportsline

A live, livestream-style timeline of play-by-play across the sports a viewer cares about, with filtering and drill-in to full game and play detail. This glossary defines the domain language; it is not a spec.

## Language

### Leagues & Sources

**League**:
One of the competitions Sportsline covers: MLB, NBA, NFL, NHL and college football. College football is covered only in part: games involving a team from the ACC, Big 12, Big Ten or SEC, Notre Dame, or a Ranked team, whoever the opponent is. Other leagues are out of scope.
Each Viewer arranges the Leagues: the order they appear in, and which are hidden. A hidden League is left out of All and the Scope row, but its Follows still count.
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
How much a Play matters, assigned per League: Scoring (changes the score; in the NBA, where baskets come constantly, only a go-ahead basket that gives a team the lead), Notable (momentum or game-state moments that don't score, such as turnovers, ejections, lead changes), or Routine (everything else).
_Avoid_: priority, importance, weight

**Retention**:
How long Plays are kept. Scoring and Notable Plays, Game Milestones and any Play with a Reaction are kept for good; Routine Plays are trimmed once their Sports Day is more than 30 days old. A Game's thread from before then shows only what mattered.
_Avoid_: archive, expiry, TTL

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
The live, reverse-chronological stream of Plays and Game Milestones in the Viewer's chosen Scope on one Sports Day, deduplicated, then narrowed by any active filters (one Game, Highlights).
_Avoid_: feed, stream, ticker

**Scope**:
Which Plays a Timeline draws from: All (every League the Viewer hasn't hidden), Following (the Viewer's Follows), Predictions (the Games their open Predictions depend on, or just one Prediction's: its Players' plays and its other Legs' Games), Fantasy (plays by both sides' Starters in their Matchups), a single League, Top 25 (college football Games with a Ranked team), or a Conference. A Viewer switches Scope freely; it starts on Following when they follow anything, otherwise All.
_Avoid_: view, tab, mode

**Team page**:
Everything about one Team: its season from the Source (what's next, and results, each opening that Game's thread; an older Game is fetched when opened), its record from those results, and its roster (each opening the Player). Opened from a Team's avatar anywhere.
_Avoid_: team profile, team hub

**Conference**:
One of college football's major conferences Sportsline groups by: the SEC, Big Ten, Big 12 and ACC. Like a Ranked team's rank, a team's Conference is recorded per Game. Each Conference, and Top 25, has its own Scope, and sits on the Scope row a Viewer arranges alongside the Leagues.
_Avoid_: division, league (a Conference is within the college football League)

**Ranked**:
A college football team in the AP Top 25 when a Game is played. The rank belongs to the Game, not the Team: it is the team's rank that week. Any Game with a Ranked team is covered, whatever the conferences.
_Avoid_: top team, rated

**Highlights**:
A Timeline filter that keeps only Scoring and Notable Plays (and Game Milestones).
_Avoid_: top plays, key plays

**Sports Day**:
The calendar day a Game belongs to for display, rolling over at 6am Eastern so late West Coast Games count toward the evening they started. The Timeline opens on today's Sports Day.
_Avoid_: date, game day

**Read Marker**:
A Viewer's position on the Timeline when they last stopped reading, shown as a "you were here" divider when they return.
_Avoid_: bookmark, last seen

**Catch-up**:
What happened while the Viewer was away, offered at the top of the Timeline when they return past their Read Marker: the Finals and the key Plays since then. Dismissing it does not move the Read Marker.
_Avoid_: recap, digest, summary

**Reaction**:
A Viewer's one-emoji response to a Play. Each Viewer has at most one Reaction per Play; reacting again replaces it.
_Avoid_: like, emote

**Prediction**:
A Viewer's position on a Kalshi market, read from their connected Kalshi account: a single Prediction (one market, e.g. "CLE to win", "Taylor 70+ receiving yards") or a Combo. Open until Kalshi settles it, then kept with its result and profit or loss.
_Avoid_: bet, wager, position (Kalshi's word, not ours)

**Combo**:
A Prediction made of several Legs that wins only if every Leg does, like a parlay. Its Legs can span Games and Leagues.
_Avoid_: parlay, multi

**Leg**:
One market a Prediction rests on, with the side taken (yes or no), and the Game, Team or Player it's about once matched to ours. A single Prediction has one Leg. A Leg is pending, won or lost.
_Avoid_: pick, selection

**Odds**:
The market's current chance of a Leg or Prediction resolving yes, from Kalshi's prices, shown as a percentage alongside where the Viewer got in. They move as the Game is played. A Combo's Odds are its Legs' Odds multiplied (a won Leg counting as certain), which is also what its cash-out is worth.
_Avoid_: line, price (the dollar figure behind it)

**Record**:
A Viewer's Predictions over a range (7 days, 30 days, a custom range or all time), by when each was made: the volume staked, how they've done (settled results only), and where they win and lose by sport, market, Combo size and Leg.
_Avoid_: stats, history (the list of Predictions), performance

**Sharp pick**:
One of the day's five Kalshi offers priced furthest below its Fair price, after Kalshi's fee, across NFL, NBA, MLB and NHL winners and main-line spreads and totals, that the Teams' Form doesn't argue against; with one combo of two or three likely legs from different Games. Published each morning for every Viewer, then followed to its Closing line value and result. Not a Prediction: nobody has bet it until a Viewer does.
_Avoid_: tip, lock, best bet

**Fair price**:
The chance a market resolves yes according to the sharp sportsbooks and exchanges (Pinnacle first), with their margins taken out and weighted toward the sharpest.
_Avoid_: true odds, consensus line

**Edge**:
A Sharp pick's Fair price minus what it costs on Kalshi, price plus fee, in percentage points. Graded strong (3 or more), edge (1 to 3) or thin (less: the best of a fairly priced day).
_Avoid_: value, EV (expected value per dollar is the Edge divided by the cost)

**Form**:
How a Team has played lately: its record and average margin over the last week, or its last three Games when that's fewer (an NFL week). It backs a Sharp pick when the Team it's on has been outplaying the other (or, for a total, when their recent games ran over or under the line), and leaves out a pick it clearly argues against.
_Avoid_: trend, streak, momentum

**Closing line value**:
How far Kalshi's price moved toward a Sharp pick by the time its Game started, in percentage points. Picks that keep beating the close are sharp, whatever a handful of results say.
_Avoid_: CLV in the app's text, line movement

**Progress**:
Where a stat Leg stands against its line while the Game is played: the count so far from the live box score (a team's or Player's receiving yards, a Player's points) or the score itself (totals), against what it takes to win ("212 of 300").
_Avoid_: tracker, status

**Fantasy league**:
A Viewer's fantasy league: on ESPN (football, basketball or baseball), read through their ESPN connection, or on Sleeper (football), read through their Sleeper connection. The Viewer's own Fantasy team in it, and this scoring period's Matchup; both providers' leagues look and behave the same.
_Avoid_: league (that's a sports League), contest

**Fantasy team**:
A team in a Fantasy league: its manager, and its Lineup of real Players.
_Avoid_: squad, roster (a Lineup is the roster as set)

**Lineup**:
A Fantasy team's Players as set for the scoring period, each in a slot: Starters, whose stats count, and the bench.
_Avoid_: roster, depth chart

**Matchup**:
The Viewer's Fantasy team against its opponent this scoring period, decided by fantasy points (or categories), live while their Starters play.
_Avoid_: game (a Game is real), fixture

**Fantasy points**:
What a Player's real stats are worth under a Fantasy league's scoring, totalled over a Lineup's Starters.
_Avoid_: score (a Game's), FP

**Category**:
One stat a head-to-head category league plays (runs, ERA, FG%, turnovers): each Matchup side's total over the matchup period, the better total leading it (lower for ERA, WHIP, turnovers). A side's Matchup score is the Categories it leads. Rates are totalled from their parts, never added.
_Avoid_: cat, stat category

**ESPN connection**:
A Viewer's link to their ESPN fantasy leagues, through their ESPN session cookies (docs/adr/0004). Read-only by Sportsline's choice, not ESPN's.
_Avoid_: login, integration

**Sleeper connection**:
A Viewer's Sleeper username, which finds their NFL leagues this season. Sleeper's leagues are public, so nothing secret is held.
_Avoid_: Sleeper login, Sleeper account (the Viewer has no password with us)

**Kalshi connection**:
A Viewer's link to their own Kalshi account, through a read-only API key they provide (docs/adr/0003). It lets Sportsline read their Predictions, never trade.
_Avoid_: login, integration

**Alert**:
A push notification to a Viewer's device, its title naming its source (Following, Prediction or Fantasy) and why it matters. Following: a Scoring Play, an Overturn of a score, or a Final in a Game their Team or Player Follows cover. Prediction: its key moments, meaning the odds on their side swinging sharply, a Combo's Leg hitting or missing, and its result. Fantasy: a Starter's key events, meaning their scores and, for the Viewer's own Starters, big plays. Each source sends at the Viewer's Alert level for it. League Follows never Alert. Never sent for history a LiveGame backfills.
_Avoid_: notification, push, ping

**Alert level**:
How much one Alert source sends a Viewer. Following: scores and finals, finals only, or off. Predictions: key moments, key moments plus every score in its Games, or off. Fantasy: key events for both sides' Starters, for the Viewer's own only, or off.
_Avoid_: notification settings, preferences

**Viewer**:
A person signed in to Sportsline, who owns a set of Follows. Sportsline is only for Viewers: a signed-out visitor sees the landing page and nothing else.
_Avoid_: user, account, member

**Agent**:
An AI assistant (Grok, Claude, a Viewer's own bot) that reads Sportsline on a Viewer's behalf through its MCP server, with an API token the Viewer created (docs/adr/0007). It sees what that Viewer can and does nothing a token's scope doesn't allow: today, only reading Sharp picks and their record.
_Avoid_: bot, integration, app

**API token**:
The secret a Viewer gives an Agent, shown once when made and revocable any time. It acts as that Viewer within its scope (read only, for now).
_Avoid_: API key (that's Kalshi's), password
