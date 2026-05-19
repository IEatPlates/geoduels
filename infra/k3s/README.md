# k3s Manifests

This directory contains reusable and local-development Kubernetes manifests.

## Layout

- `base/`: reusable manifests for app workloads and services
- `overlays/k3d/`: local multi-node k3d test overlay

Production cluster state, Flux bootstrap manifests, real ingress hosts, TLS issuers, and production runtime config live in the private ops repository.

## Local k3d Scaling Test

Use `infra/k3s/overlays/k3d` to exercise horizontal `gameplay-node` routing on a local 3-node cluster.

Requirements:

- k3d installed locally
- Docker running
- local PostgreSQL and Redis reachable from the cluster through `host.k3d.internal`
- locally built images imported into the k3d cluster, or equivalent registry access

Recommended cluster shape:

```bash
k3d cluster create geoduels \
  --servers 1 \
  --agents 3 \
  --port "80:80@loadbalancer"
```

Create a local secret from `infra/k3s/overlays/k3d/secrets.env.example` after filling in local values:

```bash
kubectl create namespace geoduels
kubectl -n geoduels create secret generic geoduels-secrets \
  --from-env-file=infra/k3s/overlays/k3d/secrets.env.example
```

Apply the overlay:

```bash
kubectl apply -k infra/k3s/overlays/k3d
```

The base manifests run PgBouncer inside the cluster and point DB-using
workloads at `pgbouncer:6432`. The `geoduels-secrets` secret must include
`PGBOUNCER_POSTGRES_HOST`, `PGBOUNCER_POSTGRES_PORT`, `PGBOUNCER_POSTGRES_DB`,
`PGBOUNCER_POSTGRES_USER`, and `PGBOUNCER_POSTGRES_PASSWORD` for PgBouncer's
upstream direct Postgres connection.
