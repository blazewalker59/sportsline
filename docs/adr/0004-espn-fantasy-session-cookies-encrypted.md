# Viewers connect ESPN Fantasy with their session cookies, stored encrypted

ESPN Fantasy has no API keys, scopes or OAuth for apps: a private league can only be read with the Viewer's own ESPN session, the `SWID` and `espn_s2` cookies. Unlike a Kalshi key (docs/adr/0003), these can't be limited to reading — they are the Viewer's full ESPN session. A Viewer captures them with a bookmarklet on espn.com (or pastes them), and Sportsline stores them sealed with AES-GCM under a Worker secret (`ESPN_ENCRYPTION_KEY`), decrypting them in memory only to read their leagues. Public leagues work without them.

We considered public leagues only (no cookies stored), which is safest but leaves out most private leagues, where the Viewer's friends play. Since reading private leagues is the point, Viewers store their cookies, and can disconnect (deleting them) at any time.

## Consequences

- Sportsline only ever reads (league, roster and matchup views); nothing it does changes a lineup or roster.
- A leak of the database and the Worker secret together would expose ESPN sessions that can act as the Viewer on ESPN. The cookies expire when the Viewer signs out of ESPN, which also ends Sportsline's access until they reconnect.
- League reads are never shared or cached across Viewers: holding a league id isn't membership.
- Fantasy players are ESPN athletes: in Leagues our Source is ESPN (NFL, college football, NBA) they map by id; elsewhere (MLB) by name.
