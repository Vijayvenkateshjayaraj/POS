# Unified Commerce System

This repository contains the application foundation for the Anna Nagar and
Ayyanambakkam unified-commerce system described in [`plan.md`](plan.md) and
[`WORKFLOWS.md`](WORKFLOWS.md). It is a TypeScript modular monolith with a
Next.js web application, a NestJS API, and one PostgreSQL system of record.

The local stack intentionally contains exactly three long-running Docker
services:

| Service | Purpose | Local URL |
|---|---|---|
| `web` | Next.js user-interface foundation and dependency health endpoint | <http://localhost:3000> |
| `api` | NestJS business API, migration/seed startup step, and upload health check | <http://localhost:4000> |
| `postgres` | Persistent PostgreSQL 16 database | `localhost:5432` |

There is no Redis, MinIO, separate worker, or one-off migration container.
Foundation startup runs migrations and the idempotent sample seed inside the
`api` container before the API starts. Local uploads use `./uploads`; later
production object storage is outside this local-development scope.

## Docker setup

### Prerequisites

- Docker Desktop or Docker Engine with Docker Compose v2
- Ports 3000, 4000, and 5432 available on localhost, or override them in an
  ignored `.env` file

No environment file is required for the default local stack. To customize
ports or non-secret names, copy the template:

```bash
cp .env.example .env
```

Start the full system from the repository root:

```bash
docker compose up
```

Compose builds the two application images on first use, waits for PostgreSQL,
applies committed migrations, loads sample data, and starts the API and web
services. Add `--build` after changing a Dockerfile or dependency:

```bash
docker compose up --build
```

The PostgreSQL named volume `postgres_data` survives normal container removal.
The host folder `./uploads` is bind-mounted at `/app/uploads` in `api`, so local
uploaded files also survive container replacement.

### Verify the stack

```bash
docker compose config --services
docker compose ps
curl --fail http://localhost:4000/health/live
curl --fail http://localhost:4000/health/ready
curl --fail http://localhost:3000/health
```

`docker compose config --services` must list only `postgres`, `api`, and `web`.
After startup, all three rows in `docker compose ps` should be `healthy`.

The API checks both its PostgreSQL connection and write access to the mounted
uploads directory. The web health endpoint checks the API readiness endpoint,
so a healthy web service confirms the complete dependency chain.

Stop containers without removing data:

```bash
docker compose down
```

To intentionally erase the local database and rebuild the sample data, remove
the named volume as an explicit reset operation:

```bash
docker compose down --volumes
docker compose up
```

Files in `./uploads` are not deleted by that database reset.

### Local Docker authentication boundary

The Compose-only PostgreSQL instance uses passwordless trust authentication on
its private Docker network and binds its host port to `127.0.0.1`. This is for
isolated local development only. It must never be copied to staging or
production. Production must use managed identity or generated credentials from
a secret manager, TLS, private networking, and least-privilege database roles.

## Direct setup without Docker

### Prerequisites

- Node.js 22 or newer and npm 10 or newer
- PostgreSQL 16 or newer

Create a local database and role using the authentication policy appropriate
for your workstation. One common local setup is:

```bash
createuser --createdb unified_commerce
createdb --owner=unified_commerce unified_commerce
```

If the local PostgreSQL server requires a password, generate a development-only
password and put it only in the ignored `apps/api/.env`. Do not commit it.

Create the direct-run environment files and install dependencies:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
npm install
```

Adjust `DATABASE_URL` in `apps/api/.env` if the local database name, role,
port, or authentication differs. Then apply the schema and load the idempotent
sample data:

```bash
npm run db:migrate
npm run db:seed
npm run db:status
```

Start the API in one terminal:

```bash
npm run dev:api
```

Start the web application in a second terminal:

```bash
npm run dev:web
```

The same URLs and HTTP health checks shown in the Docker section now apply.
The API creates `./uploads` if needed and verifies it can write there.

## Database migrations

Prisma owns the schema contract. Committed production-style SQL migrations are
under `apps/api/prisma/migrations`; `prisma migrate deploy` applies only pending
migrations and records them in PostgreSQL. Container startup fails instead of
starting against an outdated or partially migrated database.

For a schema change during development:

1. Update `apps/api/prisma/schema.prisma`.
2. With a direct development database running, run
   `npx prisma migrate dev --schema apps/api/prisma/schema.prisma --name <name>`.
3. Review the generated SQL before committing it.
4. Re-run the health checks after applying it.

Never edit an already-applied migration. Add a new forward migration instead.

## Sample data

The seed creates development-only records that exercise the approved workflow
foundation:

- Anna Nagar and Ayyanambakkam as configurable peer locations
- bilingual loose Ponni rice and Toor dal products stored in integer grams
- a counted 1 L gingelly-oil product
- retail and approved-wholesale INR price books with quantity tiers in paise
- product visibility for POS, kiosk, ecommerce, and wholesale at both shops
- a sample supplier and per-shop opening inventory ledger/balance records
- configurable whole-basket routing with automatic and manual split disabled

Running the seed repeatedly does not duplicate opening ledger entries and does
not reset an existing inventory balance. Sample tax, pricing, stock, names, and
supplier values are test fixtures—not approved production business data.

## Environment and secret policy

- `.env`, `.env.*`, and app-local environment files are ignored; only
  non-secret `.env.example` templates are committed.
- Never commit passwords, API keys, Razorpay credentials, production database
  URLs, signing keys, customer data, or delivery proof.
- Never bake secrets into a Dockerfile, image, Compose file, frontend variable,
  migration, seed, log, or upload.
- `NEXT_PUBLIC_*` values are browser-visible and therefore must never contain a
  secret.
- Use a managed secret store and separate credentials for development, staging,
  and production.

## Project layout

```text
apps/
  api/                 NestJS API, health checks, Prisma schema/migrations/seed
  web/                 Next.js web foundation and dependency health check
uploads/               Bind-mounted local file storage; contents are ignored
compose.yaml           Exactly web, api, and postgres services
plan.md                Approved architecture and delivery plan
WORKFLOWS.md           End-to-end business workflow specification
```

