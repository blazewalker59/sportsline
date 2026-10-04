# Viewers connect Kalshi with their own read-only API key, stored encrypted

Kalshi has no delegated or OAuth read access for apps like this one: the only way to read a Viewer's positions is to sign requests with their own API key (an RSA or Ed25519 private key). So a Viewer pastes their key ID and private key into Sportsline, which stores the private key encrypted with AES-GCM under a key held only as a Worker secret (`KALSHI_ENCRYPTION_KEY`), and decrypts it in memory just to sign reads. Kalshi keys can be scoped, so Sportsline only accepts a key whose scopes are read-only, checked with Kalshi when it's connected; a key that could trade or move money is refused.

We considered keeping a single owner's key as a Worker secret (never in the database), which is safer but means only one person could ever connect. Since the app is for a group of friends, each Viewer connects their own.

## Consequences

- A database leak alone exposes no usable keys; a leak of the database and the Worker secret together exposes read-only keys, which can see positions but never trade.
- Rotating `KALSHI_ENCRYPTION_KEY` makes every stored key unreadable: Viewers would reconnect.
- Kalshi's own market data (prices, games, players, combo legs) is public and read without any key; only portfolio reads are signed.
- If Kalshi's site can't create read-only keys, connecting isn't possible until it can (or this decision is revisited).
