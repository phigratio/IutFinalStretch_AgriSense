# VPS Deployment

This repo supports two production layouts:

- `docker-compose.prod.yml`: Caddy owns public ports `80/443`.
- `docker-compose.vps-nginx.yml`: host Nginx already owns `80/443` and proxies to Docker loopback ports.

For the current VPS, use the host-Nginx layout. Do not run the Caddy production overlay there.

## Current VPS Layout

Server facts verified during deployment prep:

- SSH user: `astareoadmin`
- App directory: `/srv/muqtadir/iut_ict_fest`
- Host Nginx already listens on `80/443`
- Free on both the VPS and local machine:
  - backend: `127.0.0.1:8093`
  - Grafana: `127.0.0.1:8094`
  - frontend: `127.0.0.1:8095`
  - Temporal UI: `127.0.0.1:8084`
  - Prometheus: `127.0.0.1:8087`
  - Tempo: `127.0.0.1:8088`

The VPS overlay publishes only those selected UI/API ports. Postgres, mem0, Neo4j, Temporal gRPC, Loki, and OTel Collector remain private inside Docker.

## Manual VPS Deploy

1. Copy `.env.vps.example` to `.env` on the VPS:

```bash
cd /srv/muqtadir/iut_ict_fest
cp .env.vps.example .env
chmod 600 .env
```

2. Fill the real values in `.env`, especially:

```bash
PUBLIC_HOST=your-domain.example
OPENAI_API_KEY=sk-...
OPENAI_STT_MODEL=whisper-1
POSTGRES_PASSWORD=...
AUTH_TOKEN_SECRET=...
MEM0_API_KEY=...
MEM0_JWT_SECRET=...
MEM0_NEO4J_PASSWORD=...
TEMPORAL_POSTGRES_PASSWORD=...
GRAFANA_ADMIN_PASSWORD=...
```

3. Start the stack:

```bash
docker compose -f docker-compose.yml -f docker-compose.vps-nginx.yml up -d --build --remove-orphans
```

The backend image runs Prisma migrations before starting Express.

## Host Nginx

Use `deploy/nginx/iut_ict_fest.conf.example` as the host Nginx template.

Routing:

- `/` -> `http://127.0.0.1:8095`
- `/api/`, `/auth/`, `/health` -> `http://127.0.0.1:8093`
- `/grafana/` -> `http://127.0.0.1:8094/grafana/`

After installing the Nginx config:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## GitHub Actions Deploy

Workflow: `.github/workflows/ci-cd.yml`

CI runs on pushes and PRs. Deployment runs when:

- manually triggered with `workflow_dispatch`, or
- pushed to `auth-google-oauth-production`

Create a GitHub Environment named `production` and set these secrets:

```text
VPS_HOST
VPS_USER
VPS_SSH_PRIVATE_KEY
POSTGRES_PASSWORD
AUTH_TOKEN_SECRET
OPENAI_API_KEY
MEM0_API_KEY
MEM0_JWT_SECRET
MEM0_NEO4J_PASSWORD
TEMPORAL_POSTGRES_PASSWORD
GRAFANA_ADMIN_PASSWORD
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
BDAPPS_APP_ID
BDAPPS_PASSWORD
```

Set these environment variables:

```text
PUBLIC_HOST
VPS_APP_DIR=/srv/muqtadir/iut_ict_fest
VPS_DEPLOY_BRANCH=rag-mem0
VPS_APP_PORT=8093
VPS_FRONTEND_PORT=8095
VPS_GRAFANA_PORT=8094
VPS_TEMPORAL_UI_PORT=8084
VPS_PROMETHEUS_PORT=8087
VPS_TEMPO_PORT=8088
POSTGRES_DB=iut_ict_fest
POSTGRES_USER=iut_ict_fest
GRAFANA_ADMIN_USER=admin
BDAPPS_BASE_URL=https://developer.bdapps.com
```

The workflow renders `.env` from GitHub secrets on every deploy, copies it to the VPS, checks out the deploy branch, validates Compose config, rebuilds containers, and verifies `http://127.0.0.1:8093/health`.

## Health Checks

From the VPS:

```bash
curl -fsS http://127.0.0.1:8093/health
curl -fsS http://127.0.0.1:8095/
curl -fsS http://127.0.0.1:8094/grafana/api/health
curl -fsS http://127.0.0.1:8084/
curl -fsS http://127.0.0.1:8087/-/healthy
curl -fsS http://127.0.0.1:8088/ready
docker compose -f docker-compose.yml -f docker-compose.vps-nginx.yml ps
```

From outside, after DNS and Nginx are configured:

```bash
curl -I https://YOUR_DOMAIN/health
curl -I https://YOUR_DOMAIN/
curl -I https://YOUR_DOMAIN/grafana/api/health
```

For direct IP:port hosting, use the public ports directly:

```bash
curl -I http://YOUR_SERVER_IP:8095/
curl -I http://YOUR_SERVER_IP:8094/
curl -I http://YOUR_SERVER_IP:8084/
curl -I http://YOUR_SERVER_IP:8087/
curl -I http://YOUR_SERVER_IP:8088/
```
