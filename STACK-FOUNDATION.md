# Saga — Stack Foundation

Adapted from a friend's `STACK-FOUNDATION-FOR-CURSOR.md` template for a similar personal-life-management app. Kept: DB layout, container conventions, app shape. Dropped: nothing yet — this is single-tenant already, which matches Saga (one user: Brandon).

**One change from the original:** the template assumes Docker Desktop (Mac/Windows), where `host.docker.internal` resolves for free. Saga's runtime is the `saga` Ubuntu 24.04 LXC (on Proxmox on the m920q — see SETUP-CHECKLIST.md) running plain Docker Engine, where that hostname does **not** resolve automatically. Every compose service below that needs it carries an explicit `extra_hosts: ["host.docker.internal:host-gateway"]` — that's the only structural change from the original doc.

---

## 1. What this stack is

| Layer | Choice |
|-------|--------|
| Runtime | **Docker-first** — Node/Prisma/Vite run **inside containers** on the m920q. No host Node required on that box. |
| DB | **PostgreSQL 16** in its **own** Compose project; API connects over TCP (`host.docker.internal:5432`) |
| API | **Fastify 5** + **TypeScript** + **Prisma** (migrations only) |
| Web | **React 19** + **Vite** + **TypeScript** + **TanStack Query** + **Axios** + **React Router** + **Tailwind CSS** + **Zod** |
| Optional | **MinIO** (S3 media — e.g. grocery-ad screenshots, avatar photos), **OpenObserve** (logs), **Ollama** (local models, native install on the host, not containerized — see SETUP-CHECKLIST.md), a thin MCP adapter over the API |
| Repo layout | One folder per app under `C:\Users\lostlegend\Projects\saga\`, plus a shared `local-data/` for infra |

Day-one goal: **Postgres up with an app role + database**, then a **healthy API + SPA shell**. Domain modules (checklists, calendar, grocery AI, goals) come after.

---

## 2. Database

Postgres is a **standalone infra stack**, not a sidecar in the API compose file.

### Layout

```text
local-data/postgres/
  docker-compose.yml
  .env                 ← POSTGRES_* for the container; also record app role creds
  data/                ← bind-mounted PGDATA (gitignored)
```

### Compose rules

| Rule | Why |
|------|-----|
| Official image (`postgres:16-alpine`) | Predictable, matches prod major version |
| Bind mount `./data` → `/var/lib/postgresql/data` | Data survives container recreate; wipe = delete `data/` |
| Publish `127.0.0.1:5432:5432` | Reachable from host + other containers; not exposed to the LAN |
| Healthcheck `pg_isready` | API/migrate waits on a real ready signal |
| `restart: unless-stopped` | Comes back after a host reboot |

```yaml
name: local-postgres
services:
  postgres:
    image: postgres:16-alpine
    container_name: saga-postgres-dev
    restart: unless-stopped
    env_file: [.env]
    ports: ["127.0.0.1:5432:5432"]
    volumes: ["./data:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB"]
      interval: 5s
      timeout: 5s
      retries: 5
```

### Two roles (once per fresh `data/`)

| Role | Purpose |
|------|---------|
| **Superuser** (`POSTGRES_USER` / `POSTGRES_PASSWORD`) | Owns the container bootstrap DB. Admin only — never used by the app. |
| **App role** (`saga_api_user`) | What Prisma/`DATABASE_URL` uses. Owns the `saga_db` database and `public` schema. |

```bash
docker exec -it saga-postgres-dev psql -U <POSTGRES_USER> -d <POSTGRES_DB>
```

```sql
CREATE USER saga_api_user WITH PASSWORD '<app-password>';
CREATE DATABASE saga_db;
GRANT ALL PRIVILEGES ON DATABASE saga_db TO saga_api_user;
\c saga_db
ALTER SCHEMA public OWNER TO saga_api_user;
GRANT CONNECT ON DATABASE saga_db TO saga_api_user;
GRANT USAGE, CREATE ON SCHEMA public TO saga_api_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLES TO saga_api_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO saga_api_user;
```

Record app creds in `local-data/postgres/.env` and mirror into `saga-api/.env`:

```text
DATABASE_URL=postgresql://saga_api_user:<app-password>@host.docker.internal:5432/saga_db
```

### Reset / password changes

Changing `POSTGRES_*` after first boot has no effect (data already initialized). Stop the stack, delete `local-data/postgres/data/`, start again, re-run the app-role SQL.

### Prisma discipline

| Do | Don't |
|----|--------|
| `prisma migrate dev` / `migrate deploy` | `prisma db push` |
| Generate + migrate **inside the API container** | Rely on host Node against a different `DATABASE_URL` |
| Restart API after first migrate on empty DB | Assume first boot works before migrations exist |

```bash
docker compose -f docker-compose.dev.yml --profile dev exec api \
  sh -c "npx prisma generate && npx prisma migrate deploy"
docker compose -f docker-compose.dev.yml --profile dev restart api
```

### Who talks to the DB

| Service | Talks to Postgres? |
|---------|--------------------|
| API | **Yes** — only process with Prisma |
| Web | No — HTTP to API only |
| MCP (optional) | No — HTTP to API only |

---

## 3. Container structure

| Decision | Rule |
|----------|------|
| Compose projects | **One per service** (postgres, api, web, …), not one giant file |
| Networking | Reach peers by **host address + port** (`host.docker.internal:<port>`), with `extra_hosts: ["host.docker.internal:host-gateway"]` on every service that needs it — required on Ubuntu Server's plain Docker Engine (see note at top of this doc) |
| Dev hot-reload | Bind-mount source; rebuild only when lockfile or Dockerfile `dev` stage changes |
| `node_modules` | Named volume at `/app/node_modules` |
| Profiles | Local = profile `dev`. Deploy = `staging`/`production` compose files if Saga ever needs them |

### Topology

```
Browser  →  <m920q-ip>:<web-port>   →  web container (Vite)
                                          ↓  proxy → host.docker.internal:<api-port>
                                     api container (Fastify + tsx watch)
                                          ↓  DATABASE_URL → host.docker.internal:5432
                                     postgres container (own compose project)
                                          ↓
                                     local-data/postgres/data/

Ollama (native, on the host)  ←  called over HTTP from the API container
                                  (http://host.docker.internal:11434)
```

### Env wiring

| Hop | Env var | Value |
|-----|---------|-------|
| API → Postgres | `DATABASE_URL` | `postgresql://saga_api_user:…@host.docker.internal:5432/saga_db` |
| Web → API | `VITE_API_URL` | `http://host.docker.internal:<api-port>` |
| API → Ollama | `OLLAMA_URL` | `http://host.docker.internal:11434` |
| API → Claude (escalation for reasoning-heavy tasks) | `ANTHROPIC_API_KEY` | set per README's AI strategy section; never committed |
| API → MinIO (optional) | `S3_ENDPOINT` | `http://host.docker.internal:9000` |

**After changing `.env`:** `docker compose … up -d --force-recreate` to reload process env.

---

## 4. Workspace layout

```text
saga/
  README.md
  SETUP-CHECKLIST.md
  STACK-FOUNDATION.md
  local-data/
    postgres/                      ← compose + .env + data/
    minio/                         ← optional, later
    openobserve/                   ← optional, later
  saga-api/                    ← git repo
  saga-web/                    ← git repo
  saga-mcp/                    ← optional, later
  .cursor/rules/  or  CLAUDE.md    ← Docker-first + git habits
```

---

## 5. API conventions (`saga-api`)

- `docker-compose.dev.yml` — bind mount, `tsx watch`, profile `dev`, publish API port (e.g. `3000`)
- `docker compose -f docker-compose.dev.yml --profile dev up -d --build`
- Multi-stage `Dockerfile` with a `dev` target
- Entry `src/app.ts`; Prisma via `fastify-plugin` (`server.prisma`)
- Modules: `src/modules/<domain>/` (`routes`, `controller`, `service`, schema) — domains map to Saga's feature list: `checklists`, `projects`, `goals`, `calendar`, `groceries`, `alerts`, …
- First routes: `GET /health`, `GET /ready` (DB ping)
- Response envelope `{ "status", "message", "code", "data" }`, documented in `docs/api-contract.md`
- Agent entry: `docs/INDEX.md`; feature notes in `docs/features/`

---

## 6. Web conventions (`saga-web`)

- Same compose pattern; Vite on a dedicated port (e.g. `5180`)
- Structure: `src/core/api`, `src/features/`, `src/shared/components/`, Tailwind entry under `src/assets/styles/`
- TanStack Query + Axios client that understands the API envelope

---

## 7. Optional siblings

- **MCP** — separate compose; calls the API with user credentials; never opens Postgres directly. Useful later if Saga should be queryable from a Claude session ("what's on my grocery list").
- No infra/staging-prod repo needed — this is a single box, not a fleet.

---

## 8. Operating rules

1. **Docker-first** — `docker exec` / `docker compose … exec` / logs / restart over host `npm`/`npx` on the m920q.
2. **Git** — branch `feat/…` or `fix/…`, never commit straight to `main`, PR if it matters, don't merge unless asked.
3. **Docs** — read `docs/INDEX.md` for the relevant domain; update feature docs + the API contract when surfaces change.
4. **Secrets** — never commit `.env` or passwords.

---

## 9. Scaffold phases

### Phase 0 — Workspace + DB
- `local-data/postgres` compose + `.env` + gitignored `data/`
- Create superuser via compose env; create app role + app database with the SQL above
- Empty `saga-api` / `saga-web` with `.env.example` only

### Phase 1 — API skeleton
- Dockerfile + `docker-compose.dev.yml` + Fastify + Prisma plugin + `/health` + `/ready`
- `DATABASE_URL` → app role @ `host.docker.internal:5432`
- First migration; migrate + generate **inside** the API container
- `docs/api-contract.md` + `docs/INDEX.md` + `docs/features/initial-project-setup.md`

### Phase 2 — Web skeleton
- Vite React TS + Tailwind + Axios envelope + TanStack Query + router shell
- Proxy to API via `host.docker.internal`

### Phase 3 — Auth
- Single user table, single "household" if sharing the calendar with others ends up needing more than one account. No multi-tenant provisioning.

### Phase 4 — Domain modules
- Checklists / projects, goals, calendar + reminders, grocery AI, alerts — roughly in the order laid out in `README.md`'s Scope section.

### Phase 5 — Optional
- MinIO, OpenObserve, MCP, Ollama integration for the AI-powered features — only as each feature needs them.

---

## 10. Out of scope

- Multi-tenant companies, entitlement tiers, org bootstrap
- The friend's own product's domain modules (events, Stripe Connect, Google Workspace flows) — not relevant here
- Anything needing a second Proxmox/staging environment — this is one box, one household

---

## 11. Smoke checklist

- [ ] Postgres healthy on `127.0.0.1:5432`; app role can `\c saga_db`
- [ ] `DATABASE_URL` in API `.env` uses the app role, not superuser
- [ ] API `/health` ok; after migrate, `/ready` ok
- [ ] Web loads; proxy reaches API
- [ ] Hot reload without image rebuild
- [ ] `host.docker.internal` resolves inside containers (test with `docker compose exec api getent hosts host.docker.internal`) — confirms the `extra_hosts` fix took
- [ ] Migrations run via `docker compose … exec` (no host Node required)
