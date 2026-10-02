# Sportsline owns Team, Player and Game identity; Source IDs are mapped

Follows must survive swapping a League's Source, but every Source has its own ID scheme. Sportsline assigns its own IDs to Teams, Players and Games, and each Source adapter maintains a mapping from (Source, source ID) to the internal ID. Nothing outside an adapter ever stores or compares a Source ID. Swapping a Source means building a new mapping (matched on name, team, position, birthdate, with manual review of leftovers) rather than migrating every Follow and Play.

## Consequences

- A relocated or renamed franchise keeps its internal Team ID, so Team Follows carry over.
- Rosters sync nightly from the Source so newly called-up Players are followable the same day.
