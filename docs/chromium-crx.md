# Chromium CRX Install

Tab Pilot is installed into Chromium as a packed CRX controlled by local managed policy. This avoids
the Developer Mode requirement for daily use.

## Why Managed Policy

If Chromium shows this warning:

```text
Activate Developer Mode to use this extension. It has not been verified by the Chrome Web Store.
```

then Chromium is treating the CRX as a regular user-installed off-store extension. Remove that copy
from `chrome://extensions` and install through managed policy instead.

## Pack The Extension

Build first:

```bash
pnpm build:extension
```

Pack:

```bash
pnpm crx:pack
```

Generated files are written under `apps/extension/.local/` and ignored by git:

- `tab-pilot.pem` - persistent private key used to keep the extension ID stable
- `tab-pilot.crx` - packed extension
- `updates.xml` - local update manifest pointing Chromium at the CRX
- `chromium-managed-policy.json` - managed policy for force-installing Tab Pilot
- `chromium-external-extension.json` - legacy Linux external extension preferences JSON

Keep `tab-pilot.pem`. Losing or replacing it changes the extension ID, which makes Chromium treat the
extension as a different extension.

## Install Managed Policy

Try:

```bash
pnpm crx:install
```

If your user cannot write to `/etc/chromium`, the script prints a `sudo install` command. The command
will look like:

```bash
sudo install -Dm644 apps/extension/.local/chromium-managed-policy.json /etc/chromium/policies/managed/tab-pilot.json
```

The managed policy has this shape:

```json
{
  "ExtensionSettings": {
    "<extension-id>": {
      "installation_mode": "force_installed",
      "update_url": "file:///absolute/path/to/apps/extension/.local/updates.xml",
      "override_update_url": true
    }
  }
}
```

After installing the policy:

1. Remove old disabled copies from `chrome://extensions`.
2. Restart Chromium completely.
3. Open `chrome://policy`.
4. Click Reload policies if needed.
5. Confirm `ExtensionSettings` is listed and has no error.
6. Open `chrome://extensions` and confirm Tab Pilot is enabled without Developer Mode.

## Legacy External Install Flow

The older Linux external extension preferences flow is still available:

```bash
pnpm crx:install-external
```

That writes JSON intended for:

```text
/usr/share/chromium/extensions/<extension-id>.json
```

Use the managed policy flow first. It is more explicit in `chrome://policy` and avoids the disabled
off-store extension state seen with normal CRX installs.

## Updating The Extension

For frontend changes:

```bash
pnpm build:extension
pnpm crx:pack
```

If Chromium does not pick up the new CRX, bump:

```text
apps/extension/manifest.json -> version
```

Then rebuild, repack with the same PEM, and restart Chromium:

```bash
pnpm build:extension
pnpm crx:pack
```

The policy can stay in place as long as `updates.xml` remains at the same path.

## Troubleshooting

If the extension is disabled with the Developer Mode warning:

- Remove it from `chrome://extensions`.
- Confirm `/etc/chromium/policies/managed/tab-pilot.json` exists.
- Confirm `chrome://policy` shows `ExtensionSettings`.
- Restart Chromium completely.

If `chrome://policy` does not show `ExtensionSettings`, reinstall the policy:

```bash
sudo install -Dm644 apps/extension/.local/chromium-managed-policy.json /etc/chromium/policies/managed/tab-pilot.json
```

If the extension ID changes unexpectedly, check whether `apps/extension/.local/tab-pilot.pem` was
deleted or regenerated.

## References

- Chrome alternative installation methods:
  https://developer.chrome.com/docs/extensions/how-to/distribute/install-extensions
- Chromium Linux policy paths:
  https://chromium.googlesource.com/chromium/src/+/main/docs/enterprise/policies.md
- Chrome `ExtensionSettings` policy:
  https://support.google.com/chrome/a/answer/9867568

