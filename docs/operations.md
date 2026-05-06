# Operations and SRE Guide

## Runtime SLO Targets

- Runtime command->event latency p95: `< 150ms` (in-region)
- Runtime availability: `99.95%`
- Resume success ratio: `> 99.9%`
- Queue wait p95 (normal load): `< 20s`

## Core Metrics Endpoints

- API: `GET /metrics`
- Runtime-core: `GET /metrics`
- Rank worker: `GET /metrics` (default `:9102`)

## Critical Metrics

- `geoduels_runtime_commands_total{type,status,error_code}`
- `geoduels_runtime_command_latency_seconds`
- `geoduels_runtime_ownership_transfers_total`
- `geoduels_runtime_ownership_renew_failures_total`
- `geoduels_runtime_forward_total{result}`
- `geoduels_runtime_resume_failures_total`
- `geoduels_runtime_nats_publish_failures_total`
- `geoduels_runtime_db_write_failures_total`
- `geoduels_runtime_connected_users`
- `geoduels_runtime_queue_wait_seconds`
- `geoduels_api_requests_total`
- `geoduels_api_request_latency_seconds`

## Alert Priorities

### P1 (Page)

- Runtime ownership renew failures sustained > threshold
- Runtime DB write failures > 0 for sustained period
- Runtime NATS publish failures > threshold
- Runtime p95 command latency > 150ms sustained

### P2 (Ticket)

- Queue wait p95 > 20s sustained
- Resume failure ratio > 0.1%
- Forward command error ratio > 1%

## Incident Response Quick Path

1. Confirm runtime readiness and ownership churn.
2. Check Redis/NATS/Postgres health and connection errors.
3. Check command error breakdown by `error_code`.
4. If owner flapping: reduce HPA churn, inspect node pressure, review Redis RTT.
5. If DB write failures: protect realtime path, enable degraded mode, restore DB connectivity.
6. If NATS publish failures: verify stream/consumer health, pending limits, connectivity.

## Recommended Dashboards

- Runtime Health: connections, ownership transfers, renew failures, command latency
- Match Flow: queue wait, match starts, resume success/failure
- Infra Dependencies: Redis RTT/errors, NATS publish/consume health, DB query errors
- API Surface: req/sec, p95 latency, 4xx/5xx splits
