# Trend picks on demand, from our own game history

Agents (docs/adr/0007) get asks like "a good bet on the Avs game" or "a good NBA bet tonight". The daily Sharp picks (docs/adr/0006) answer what's best across a whole day, priced once a morning against the sharp sportsbooks through The Odds API's free tier. Pricing every ask the same way would spend about 3 of the 500 monthly credits per league each time. So on-demand picks use a fair price we can compute for free, from Sportsline's own game history.

**The trend model** (`src/lib/sharp/trends.ts`, pure):
- **Form:** each Team's form is the same as a Sharp pick's: average margin and average total over its last 7 days of finals, or its last 3 games within 28 days when that's fewer (a weekly football schedule with a bye). A Team with fewer than 3 games gets no trend.
- **Shrinking:** a week of scores is mostly noise, so a Team's form counts n / (n + 6) of itself (6 games count half). The rest is the League's average.
- **Expectations:**
  - expected home margin = home rating − away rating + a home edge (NFL 1.5 points, college football 2.5, NBA 2.3, MLB 0.2 runs, NHL 0.15 goals);
  - expected total = the average of both Teams' shrunk totals.
- **Chances:** each Line's chance comes from a normal curve around those expectations. The margin spreads by NFL 13.5, college football 16, NBA 12.5, MLB 4.2, NHL 2.4. The total spreads by NFL 13.5, college football 16, NBA 18, MLB 4.4, NHL 2.3.
- **Blending:** the fair price is 35% that chance and 65% Kalshi's own price (the middle of its YES bid and ask). The market knows injuries, lineups and much more than a week of finals; the blend keeps a trend from claiming edges out of noise. It can only lean against Kalshi's price.

**Picking** reuses the Sharp pick engine with the sharp-source rule switched off (`requireSharp: false`):
- main lines only, prices 20–80¢, spreads no wider than 6¢, at least 20 minutes before the start, Kalshi's fee counted;
- Form against a pick still leaves it out;
- anything more than 5 points against us is never shown.

Equivalent bets collapse into one, the best-valued: on a winner market, "COL win" and "ANA lose". For one Game, the best of its markets come back. For several Games, the slate's selection gives one per Game with a mix of Leagues and markets. A `surprise` ask picks at random among the offers the trends favor.

**Combos.** An ask for `legs` (2–6) gets one combo instead of singles, built as the daily Sharp combo is: one leg a Game, each 45%+ likely by the blended fair price, biggest edges first. It comes with the legs' prices multiplied (roughly Kalshi's quote), the combined fair chance, and the worst quote worth taking. Kalshi prices a combo only when it's built, so the Viewer builds it there; Agents can't propose one. Its legs are recorded as the ask's picks.

**The ask** is structured, and the Agent fills it from what was said:
- a Team, by city, nickname, abbreviation or fans' shorthand ("Avs", "Habs", "Sixers");
- and/or a League (or a sport word; "college football" is college, not the NFL);
- a day (today or tomorrow);
- and a Slate: the Games kicking off in one Eastern window (early before 11am, noon to 2:30pm, afternoon to 6pm, evening to 9:30pm, late after), so "the noon slate" means college football's noon kickoffs.

Without a day, a Team's next game is used, and a League's games today.

College football is covered too, though not by the Sharp picks (The Odds API and Polymarket aren't read for it). Its Games are the ones Sportsline covers (CONTEXT.md, "League"), so a Team's trend counts only its stored games: an opponent from outside the covered conferences often has too few for a pick. Kalshi's offers are read as the Sharp picks read them: with the Viewer's read-only key, or the admin's.

The tool is `find_bet`. Every pick comes with its trend note (records and margins), our trend's own chance, the blended fair price and edge, and a plain value label: value, slight, or none (the least bad on offer). The tool's description tells the Agent these are weaker than Sharp picks and to say so.

## Following the picks

Every 15 minutes, beside the Sharp picks' re-check, the open picks of the last 7 days are followed.

**Placed.** A pick is placed when the Viewer bought that side of that market after it was suggested. That's either a Prediction from the Kalshi sync, however they traded (its first fill, or when the sync first saw it), or an Agent's proposal they approved that filled, before the sync has caught up. If the same bet was suggested more than once, only the latest suggestion before the purchase is credited, so repeats don't inflate the count. A purchase made before the suggestion never counts.

**Settled.** A placed pick takes its Prediction's settlement and profit. Every other pick takes Kalshi's market result once its game has started and the market is decided.

**The record** (`get_bet_record`, and the Agents page) shows:
- the asks, and the picks offered;
- how many picks were placed, and how (themselves, or through an Agent);
- the placed picks' wins, losses, open bets, win rate and profit;
- how the skipped picks did, for comparison.

## Considered Options

- **The Odds API per ask.** The real sharp price, but a handful of asks a day would use the free tier's month. A cache by League and day would help, but would still spend credits on each new day's first ask.
- **Trends alone, unblended.** Bolder picks, but a 4–0 week would claim 15-point edges against prices that know better. The blend weight can rise if trend picks prove themselves.

## Consequences

- Every ask is recorded (`bet_requests`), answered or not, with the picks it gave (`trend_picks`). See "Following the picks" below.
- Early in a season, or for Teams with few stored finals, there's no trend and the tool says so.
- Each ask reads Kalshi's open markets for the Leagues involved (a few signed requests), not the whole day.
