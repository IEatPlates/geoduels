# Deployment Model

Production deployment state is intentionally kept outside this public source repository.

This repository owns:

- application source
- reusable Kubernetes base manifests in `infra/k3s/base`
- local k3d manifests in `infra/k3s/overlays/k3d`
- release image builds

The private ops repository owns:

- Flux bootstrap and cluster sync state
- production overlays
- production runtime config
- encrypted or externally managed secret references
- image tag pins consumed by Flux

## Release Flow

1. Merge application changes to `main`.
2. Push a version tag such as `v1.2.3`.
3. GitHub Actions builds and pushes versioned images.
4. The release workflow opens a PR in the private ops repository.
5. Merge the ops PR.
6. Flux reconciles production from the private ops repository.

The public release workflow needs `OPS_REPO_TOKEN` with access to the private ops repository. Optional repository variables:

- `OPS_REPOSITORY`, default `sourcelocation/geoduels-prod`
- `REGISTRY`, default `ghcr.io/<repository-owner>`
- `PRODUCTION_SITE_URL`, default `https://geoduels.io`
