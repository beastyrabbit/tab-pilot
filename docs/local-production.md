# Local Production Setup

This is the recommended local production shape for Tab Pilot:

- Backend: Docker Compose service running the server on `127.0.0.1:7777`
- Frontend: packed local CRX installed into Chromium by managed policy
- Persistence: bind-mounted `apps/server/auth.json` and `apps/server/data`

## First-Time Setup

Run from the repository root:

```bash
pnpm install --frozen-lockfile
pnpm pi:login
pnpm build
docker compose up -d --build
```

If `pnpm pi:login` asks for a login method, device-code login works well in a terminal:

```text
Select OpenAI Codex login method:
  1. Browser login (default)
  2. Device code login (headless)
```

Verify the server:

```bash
curl http://127.0.0.1:7777/api/health
```

Expected shape:

```json
{"status":"ok","version":"0.1.0","codex":true}
```

`codex: false` means the server is up but Pi Codex auth is missing or invalid. Re-run `pnpm pi:login`.

## Install Chromium Extension

Pack and install the CRX policy:

```bash
pnpm crx:pack
pnpm crx:install
```

If `pnpm crx:install` cannot write to `/etc/chromium`, run the printed `sudo install` command. It
will look like this:

```bash
sudo install -Dm644 apps/extension/.local/chromium-managed-policy.json /etc/chromium/policies/managed/tab-pilot.json
```

Then:

1. Remove any old disabled Tab Pilot or Tab Organizer copy from `chrome://extensions`.
2. Restart Chromium completely.
3. Open `chrome://policy` and confirm `ExtensionSettings` is loaded.
4. Open `chrome://extensions` and confirm Tab Pilot is installed without Developer Mode.

See [Chromium CRX Install](./chromium-crx.md) for details.

## Daily Run

Start the server:

```bash
docker compose up -d
```

Watch logs:

```bash
docker compose logs -f tab-pilot-server
```

Stop the server:

```bash
docker compose down
```

## Update Flow

After pulling changes:

```bash
git pull --ff-only
pnpm install --frozen-lockfile
pnpm build
docker compose up -d --build
pnpm crx:pack
```

If Chromium does not pick up an extension frontend change, bump `apps/extension/manifest.json`
`version`, run `pnpm build`, repack with the same PEM key, reinstall the policy if needed, and restart
Chromium.

## Important Files

- `compose.yaml` - Docker Compose service definition
- `apps/server/Dockerfile` - production server image
- `apps/server/tsup.config.ts` - production build config that preserves `node:sqlite`
- `apps/server/scripts/smoke-start.mjs` - production server smoke check
- `scripts/pack-extension-crx.mjs` - CRX packer and Chromium policy generator
- `apps/extension/.local/tab-pilot.pem` - persistent CRX key, ignored by git
- `apps/extension/.local/tab-pilot.crx` - packed extension, ignored by git
- `apps/extension/.local/chromium-managed-policy.json` - generated managed policy, ignored by git
- `apps/extension/.local/updates.xml` - generated local update manifest, ignored by git

