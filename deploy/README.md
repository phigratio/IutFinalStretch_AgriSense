# VPS Deployment

This stack is deployable with Docker Compose on a VPS. In production mode, only
ports `80` and `443` are public. Grafana is served under `/grafana`, the backend
is served from `/`, and Prometheus/Loki/Tempo stay private on the Docker network.

## First Deploy

1. Point your DNS `A` record to the VPS IP.
2. Install Docker and Docker Compose on the VPS.
3. Copy `.env.production.example` to `.env`.
4. Set `PUBLIC_HOST`, `ACME_EMAIL`, and a strong `GRAFANA_ADMIN_PASSWORD`.
5. Set `AUTH_TOKEN_SECRET`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, and `POSTGRES_USER`.
6. Optional: set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` for Google OAuth.
7. Start the stack:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

The backend image runs `prisma migrate deploy` before starting Express, so the
PostgreSQL auth schema is applied automatically on deploy.

## Public URLs

- Backend: `https://YOUR_DOMAIN/health`
- API: `https://YOUR_DOMAIN/api/users`
- Auth signup: `POST https://YOUR_DOMAIN/auth/signup`
- Auth login: `POST https://YOUR_DOMAIN/auth/login`
- Google OAuth: `https://YOUR_DOMAIN/auth/google`
- Grafana: `https://YOUR_DOMAIN/grafana/`

## Optional Public Telemetry Ingest

If apps outside the Docker network need to send telemetry to this VPS, also load
the public telemetry override:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.telemetry-public.yml up -d --build
```

This publishes:

- OTLP gRPC: `YOUR_DOMAIN:4317`
- OTLP HTTP: `https://YOUR_DOMAIN:4318` if you terminate TLS separately, or `http://YOUR_DOMAIN:4318` directly from the collector

For most deployments, keep `4317` and `4318` closed publicly and send telemetry
from apps on the same Docker network.

## Health Checks

```bash
curl -I https://YOUR_DOMAIN/health
curl -I https://YOUR_DOMAIN/grafana/api/health
curl -X POST https://YOUR_DOMAIN/auth/signup \
  -H 'content-type: application/json' \
  -d '{"name":"Admin","email":"admin@example.com","password":"change-me-now"}'
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
```

Prometheus targets should show `up` inside Grafana or by execing from the VPS.

## Database Schema

Authentication is managed by Prisma in `prisma/schema.prisma`.

- `app_users` stores password and OAuth users.
- `auth_identities` stores OAuth identities and has a foreign key to
  `app_users(id)` with `ON DELETE CASCADE`.

Manual migration command if needed:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec app npm run db:migrate:deploy
```
