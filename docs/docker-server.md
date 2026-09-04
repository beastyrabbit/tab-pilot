# Docker Server

The local production server runs in Docker and listens on `127.0.0.1:7777`.

## Why Host Networking

This workspace hit a Docker daemon error when Compose tried to use the default bridge network:

```text
failed to create endpoint ... on network bridge:
failed to add the host ... <=> sandbox ... pair interfaces: operation not supported
```

That error happens before project code runs. `compose.yaml` therefore uses host networking:

```yaml
build:
  network: host
network_mode: host
environment:
  TAB_ORGA_HOST: "127.0.0.1"
  TAB_ORGA_DATA_DIR: "/data"
  TAB_ORGA_AUTH_FILE: "/app/apps/server/auth.json"
```

With host networking there is no `ports:` mapping. The server itself binds to `127.0.0.1:7777`, so it
is still local-only from the host.

## Build And Start

```bash
docker compose up -d --build
```

Verify:

```bash
curl http://127.0.0.1:7777/api/health
docker compose ps
docker compose logs --tail=50 tab-pilot-server
```

Expected log line:

```text
Tab Organizer server running on http://127.0.0.1:7777
```

## Daily Commands

Start:

```bash
docker compose up -d
```

Follow logs:

```bash
docker compose logs -f tab-pilot-server
```

Stop:

```bash
docker compose down
```

Rebuild:

```bash
pnpm build
docker compose up -d --build
```

## Persistence

Compose mounts:

```yaml
volumes:
  - ./apps/server/auth.json:/app/apps/server/auth.json:rw
  - ./apps/server/data:/data:rw
```

`apps/server/auth.json` contains Pi Codex credentials created by `pnpm pi:login`. `apps/server/data`
contains the SQLite database and related runtime data. Both survive image rebuilds.

## Production Build Smoke Check

The Dockerfile runs:

```bash
pnpm --filter @tab-orga/server build
pnpm --filter @tab-orga/server smoke:prod
```

The smoke check starts the built `dist/index.js` on a temporary port and calls `/api/health`. This
catches production import failures, including the previous `sqlite` vs `node:sqlite` problem.

You can run it locally:

```bash
pnpm build:server
pnpm smoke:server
```

## Troubleshooting

If `curl http://127.0.0.1:7777/api/health` fails:

```bash
docker compose ps
docker compose logs --tail=100 tab-pilot-server
```

If port `7777` is already in use, stop the old server:

```bash
docker compose down
pkill -f "node dist/index.js" || true
pkill -f "tsx watch src/index.ts" || true
```

If health returns `"codex": false`, re-run:

```bash
pnpm pi:login
docker compose restart tab-pilot-server
```

If Docker again reports a bridge/veth error, confirm `compose.yaml` still contains both:

```yaml
build:
  network: host
network_mode: host
```
