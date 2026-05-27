# Deployment

This repository ships a Home Assistant custom card and includes a development deployment path that copies the built file directly into a Home Assistant `www` folder over Samba.

## Dev deployment

### 1. Install dependencies

From the repository root:

```powershell
pnpm install
```

### 2. Build and deploy

The repository already includes a deploy step in `package.json`:

```json
"build": "rollup -c && node scripts/deploy-to-samba.cjs"
```

Run:

```powershell
pnpm build
```

This does two things:

- builds `dist/power-flow-card-plus.js`
- copies it to the target Home Assistant folder

### 3. Default deployment target

The deploy script copies the built file to:

```text
\\homeassistant\config\www\community\power-flow-card-plus\power-flow-card-plus.js
```

If that path exists and is reachable, the deploy step will succeed.

### 4. Override the deploy target

If your Home Assistant share is mounted somewhere else, set `POWER_FLOW_DEPLOY_PATH` before running the build.

#### PowerShell

```powershell
$env:POWER_FLOW_DEPLOY_PATH = '\\homeassistant\config\www\community\power-flow-card-plus'
pnpm build
```

#### Command Prompt

```cmd
set POWER_FLOW_DEPLOY_PATH=\\homeassistant\config\www\community\power-flow-card-plus && pnpm build
```

#### Using a mapped drive

If you have mounted the share as a drive letter, for example `Z:`, use:

```powershell
$env:POWER_FLOW_DEPLOY_PATH = 'Z:\community\power-flow-card-plus'
pnpm build
```

### 5. What the deploy script does

The script in `scripts/deploy-to-samba.cjs`:

- verifies `dist/power-flow-card-plus.js` exists
- verifies the target directory exists
- copies the file into the target directory
- prints a success message with the destination path and file size

### 6. Useful commands during development

- `pnpm start` – run Rollup in watch mode (`rollup -wc`) to rebuild automatically
- `pnpm watch` – same as `pnpm start`
- `pnpm lint` – lint source files with ESLint
- `pnpm test` – run Jest tests
- `pnpm typecheck` – run TypeScript type-checking

## Manual deployment

If you do not want to use the Samba deploy script, build the card and copy the output manually:

```powershell
pnpm run build -- --no-deploy
```

Then copy `dist/power-flow-card-plus.js` to your Home Assistant `www` folder and reload resources.

> Note: The current `package.json` build script always includes the Samba deploy step. If you need manual deploy-only behavior, build separately with Rollup or adjust the script.
