# GeoDuels

GeoDuels is a GeoGuessr-style multiplayer game: Next.js web client, account/API service, matchmaking/coordinator, realtime gateway, and authoritative gameplay nodes.

## Service Boundaries

- `services/api`: browser sessions, OAuth, profiles, leaderboard, match history/session lookup, moderation/admin APIs.
- `services/match-coordinator`: pre-game multiplayer coordination, matchmaking, presence-sensitive coordination, gameplay-node assignment, gameplay ticket minting.
- `services/realtime-gateway`: gameplay websocket routing to assigned nodes.
- `services/gameplay-node`: authoritative live match simulation.

## Auth And Tickets

- Browser auth is cookie-first: `services/api` owns the `HttpOnly` refresh/session cookie, OAuth, and session rotation
- App access JWTs are for API/queue/coordination auth. Gameplay tickets are per-match gameplay admission.

## State Stores

- PostgreSQL is the durable source of truth for users, identities, auth sessions, profiles, stats, ranks, and persisted match data.
- Redis is for ephemeral coordination: queue/coordinator state, node assignment/liveness, pubsub/presence
- Shared wire/domain types live in `pkg/contracts`

## Route Semantics

- `/` is the main lobby/session launcher.
- `/match/[id]` is the canonical route for live reconnects and saved match/history views.
- API match bootstrap/session endpoints resolve existing match routes
