# GeoDuels

GeoDuels is a GeoGuessr-style game with 4 runtime roles:

- `apps/web`: Next.js client
- `services/api`: auth, profile, leaderboard, singleplayer bootstrap
- `services/match-coordinator`: duel matchmaking over websocket and gameplay-node assignment
- `services/realtime-gateway` + `services/gameplay-node`: websocket routing and authoritative live match execution

## Core architecture

- Browser auth is cookie-first:
  - `HttpOnly` session cookie
  - short-lived access JWT in memory only
  - startup auth bootstrap via `GET /v1/auth/session`
  - cold `/match/[id]` reconnects can bootstrap through `GET /v1/matches/{id}/bootstrap`
- Google login is handled server-side in `services/api`.
- App access JWTs and gameplay tickets are separate:
  - app JWT for API/queue auth
  - gameplay ticket for a specific match/node websocket connection
- PostgreSQL is the durable source of truth.
- Redis is only for queueing and distributed coordination.

## Ownership

- `pkg/persistence`: Postgres-backed users, identities, auth sessions, stats, ranks, persisted match data
- `pkg/coordinator`: Redis-backed node assignment and liveness coordination
- `pkg/duel` and `pkg/singleplayer`: match rules and round progression
- `pkg/gameticket`: short-lived signed gameplay admission tickets
- `pkg/contracts`: shared wire/domain types

## Main flows

- Auth: web -> `api` session bootstrap/refresh -> access JWT returned, session cookie rotated
- Duel: web -> `match-coordinator` websocket -> assigned node + gameplay ticket -> websocket via `realtime-gateway` -> `gameplay-node`
- Singleplayer: web -> `api` -> assignment + gameplay ticket -> websocket via `realtime-gateway`
- Match route: web `/match/[id]` -> `api` `GET /v1/matches/{id}/bootstrap` on cold loads or `GET /v1/matches/{id}/session` when already authenticated -> either:
  - live reconnect with minted gameplay ticket
  - saved match history
  - replaced / forbidden / missing route state

## Route model

- `/` is the lobby and session launcher.
- `/match/[id]` is the canonical route for a specific match.
- A match route may render:
  - live gameplay after reconnect
  - saved end-of-match/history view
  - explicit replaced / missing / forbidden state
- Route-specific lifecycle on the web is owned by `MatchRouteController`; generic queueing/live connection remains in `MatchController`.

## Constraints

- Auth changes usually require coordinated updates in both `apps/web` and `services/api`.
- Do not merge app auth and gameplay ticket auth.
- Queueing and realtime simulation are intentionally separate scaling boundaries.
- Duel creation still belongs to `services/match-coordinator`; route bootstrap/session endpoints are for reconnect/history resolution, not duel creation.
