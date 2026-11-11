# Deployment platform: single-container apps on any VPS

Status: direction agreed 2026-11-11, parked for later. Nothing here is built yet.
Canvas is the first app to adopt it; the generic parts become a reusable kit for future apps.

## Direction

Ship each app as **one Docker image with one data volume**, deployable to any VPS or cloud VM
(Hetzner, DigitalOcean, Linode, a plain EC2 instance), instead of composing managed AWS services.
This is a platform-level change: today Skyward services deploy through AWS (`skyward-api-aws` and the
deployment dashboard). Review it with those owners before other apps adopt it.

## Canvas as one container

```text
canvas:<git-sha>  (one image, one process, runs as non-root)
  ├─ Node API (Hono)       /v1/*, /health, /ready, /version
  ├─ built web app         served by the same process, deep-link fallback, security headers
  └─ file store            /data volume (canvases + .deleted/ for recovery)
```

| Today (4 containers) | Single container |
| --- | --- |
| nginx serves the web app | The API process serves it; nginx is dropped |
| API on Node via `tsx` with dev dependencies | Compiled API, production dependencies only |
| MinIO (local S3) | `FileCanvasStore` on `/data`. S3 mode stays available; MinIO remains only as a CI check of it |
| `minio-init` | Not needed |

### Trade-offs versus managed AWS

| Concern | Managed AWS | Single container | Mitigation |
| --- | --- | --- | --- |
| Durability | S3 keeps copies across machines | One disk | Scheduled off-site backups, a tested restore, provider disk snapshots |
| Availability | Multi-zone | One machine | Restart policy and health check; acceptable for a team tool |
| Scaling | Many instances | Exactly one | `FileCanvasStore` orders writes inside one process only. Take a lock on `/data` at startup and refuse a second instance |
| TLS | Load balancer | Not included | The platform's TLS, or a proxy (Caddy or the deploy tool's proxy) |
| Sign-in | Cognito | Not solved | Blocker: see "Sign-in" below |

## The app contract

Every app follows these rules so the kit can build, deploy, check, and back it up without
app-specific logic:

```text
one image · listens on $PORT · runs as non-root · state only in /data (or a DATABASE_URL)
config from env, validated at startup (fail fast) · JSON logs to stdout · clean shutdown on SIGTERM
GET /health (process up) · GET /ready (dependencies reachable) · GET /version (sha, build time)
single-instance lock on /data when the app uses a file store
```

## Kit layers

| Layer | The kit provides | Each app provides |
| --- | --- | --- |
| Contract | The rules above and a checker script | Code that follows them |
| Build and CI | `make verify`; `make release` (clean tree only → `app:<sha>`); CI workflow | Tests and its Dockerfile build stage |
| Deploy | release → staging → smoke test → promote the same SHA → production; automatic rollback on a failed smoke test; deploy log | One smoke-test hook |
| Hosting | TLS, zero-downtime swap, secrets, firewall baseline (22, 80, 443 only) | Domain and env values |
| Data | Volume layout, pre-deploy and scheduled off-site backups, `make backup` / `make restore`, a restore drill | Its data paths (or a database) |
| Sign-in | One shared OIDC verifier; one identity provider for all apps | Tenant and role mapping |
| Visibility | JSON logs, request IDs, health/ready/version endpoints, uptime checks | Nothing extra |

## Phase A for Canvas (first adopter)

1. One release image `canvas:<sha>`, built only from a clean committed tree. Deploys never build.
2. Hardened image: multi-stage build, compiled API, production dependencies only, non-root,
   health check, security headers and caching served by the app.
3. Fail-fast config validation at startup; no default credentials; no direct API port in production.
4. Two environments from the same image: staging (own volume) and production (the real canvases).
5. Smoke test after every deploy: `/health`, `/ready`, `/version` equals the released SHA, list
   canvases, create/save/delete a scratch canvas in a dedicated smoke tenant, and a deep link loads.
6. Automatic rollback to the previous SHA when the smoke test fails; every deploy recorded.
7. Backup before every production deploy; `make backup` and `make restore`; one restore drill.
8. CI builds the release image, runs it, runs the same smoke test, and audits production dependencies.

Prerequisite: no other agent has uncommitted work in the files Phase A touches (`Makefile`,
`docker-compose.yml`, Dockerfiles, `README.md`, CI workflow).

## Order

1. Harden Canvas against the contract (Phase A).
2. Extract the generic parts into a template repository.
3. Start the next app from the template.

## Open decisions

| Decision | Options | Current recommendation |
| --- | --- | --- |
| Deploy tool | Kamal (images to any VPS over SSH, zero-downtime, automatic TLS, rollback, several apps per server); own scripts with Compose and Caddy; self-hosted PaaS (Coolify, Dokku) | Kamal |
| Template languages | Node/TypeScript; Python (most Skyward services) | Both, Node first via Canvas |
| Identity provider | Decide later behind a shared OIDC verifier; self-hosted Authentik; managed Auth0 or Clerk; keep Cognito | Decide later; build the verifier first |
| Off-site backups | Cloudflare R2; Backblaze B2; AWS S3; a second VPS | Cloudflare R2 |

## Sign-in (blocker for internet exposure)

The API accepts only a hard-coded local development token. The Cognito path was a stub and its unused
helper was removed. Before any app faces the internet it needs standard OIDC token verification
(issuer, audience, expiry, signing keys from JWKS) with the tenant taken from a claim. This works with
any provider. It is security-sensitive and needs its own review before implementation.

## Later

Phase B (optional): mirror a cloud deployment locally with Terraform against the workspace's local
AWS emulator (`ministack` 1.5.24), only if an app needs managed AWS services after all.
