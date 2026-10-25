# AGENTS.md — Deployment Agent Instructions

This file documents the known issues, fixes, and operational knowledge for deploying the
`secure-agents` project to OpenShift. Any AI agent or engineer working on this repo
**must read this file before touching the deployment scripts or running `oc-deploy.sh`**.

---

## Repository Layout

This project lives inside the **monorepo** `tal2k4xj/oic-i-agentic-ai-tutorials` under
the `secure-agents/` subdirectory. This matters for every OpenShift build that clones
the repo — all `contextDir` values must be prefixed with `secure-agents/`.

```
oic-i-agentic-ai-tutorials/          ← repo root (what OpenShift clones)
└── secure-agents/                    ← THIS project
    ├── frontend/
    ├── backend/
    ├── mcp/
    ├── scripts/
    │   ├── oc-deploy.sh
    │   └── lib/
    └── .env.production
```

### Correct `contextDir` values for OpenShift BuildConfigs

| Component | contextDir |
|-----------|------------|
| frontend  | `secure-agents/frontend` |
| backend   | `secure-agents/backend` |
| mcp       | `secure-agents/mcp` |

If you see `error: provided context directory does not exist: frontend` (or `backend`, `mcp`)
in a build log, the `contextDir` is missing the `secure-agents/` prefix.

**Fix:**
```bash
oc patch bc/frontend --type=merge -p '{"spec":{"source":{"contextDir":"secure-agents/frontend"}}}'
oc patch bc/backend  --type=merge -p '{"spec":{"source":{"contextDir":"secure-agents/backend"}}}'
oc patch bc/mcp      --type=merge -p '{"spec":{"source":{"contextDir":"secure-agents/mcp"}}}'
oc start-build frontend && oc start-build backend && oc start-build mcp
```

---

## Local Git Setup

The local folder at `~/Desktop/oic-i-agentic-ai-tutorials-main/` is **not cloned from
GitHub** — it was downloaded as a zip. To connect it to the remote:

```bash
cd ~/Desktop/oic-i-agentic-ai-tutorials-main
git init
git remote add origin git@github-oic-tutorials:tal2k4xj/oic-i-agentic-ai-tutorials.git
git fetch origin --depth=1       # uses HTTPS on first fetch if SSH times out
git reset origin/main
git checkout -b main
git branch --set-upstream-to=origin/main main
```

The SSH remote uses a host alias `github-oic-tutorials` defined in `~/.ssh/config`:

```
Host github-oic-tutorials
  HostName github.com
  User git
  IdentityFile ~/.ssh/confused-deputy/ocp-key
  IdentitiesOnly yes
```

**The deploy key** lives at `~/.ssh/confused-deputy/ocp-key`. It is registered on the
GitHub repo as a deploy key. If it ever stops working, regenerate with:

```bash
./scripts/oc-deploy.sh --regenerate-ssh-key
```

**`.env.production` is intentionally untracked** — it contains secrets and must never
be committed.

---

## `.env.production` Requirements

### `API_KEY` length rule

The `validate_api_key()` function in `scripts/lib/10-validation.sh` requires:
- Minimum 16 characters
- Length must be **exactly a power of 2**: 16, 32, 64, 128, or 256

The placeholder value `changethis-min-16-chars-powerof2` is 40 characters — it will
**fail validation**. Generate a valid key:

```bash
openssl rand -hex 16   # 32 chars — valid
```

### `_CEN_FLAVOR=confused-deputy` required variables

```
APP_NAME, PROJECT_NAME, GIT_SSH_URL, ENVIRONMENT, API_KEY, VAULT_ADDR, JWT_AUDIENCE
```

Variables prefixed with `_` (e.g. `_APP_NAME`, `_GIT_SSH_URL`) are automatically
aliased without the prefix by the env loader.

---

## SSH / GitHub Deploy Key

### `oc new-app` probes SSH URLs locally — do NOT use it

`oc new-app --strategy=docker <ssh-url>` performs a local `git ls-remote` before
sending anything to the cluster. If `github.com` is not in the local machine's
`~/.ssh/known_hosts`, the SSH handshake fails and `oc new-app` rejects the URL with:

```
error: --strategy is specified and none of the arguments provided could be classified as a source code location
```

**The deployment script uses `create_app_from_git()` in `scripts/lib/70-deployment.sh`**
which applies `BuildConfig`, `ImageStream`, `Deployment`, and `Service` manifests
directly via `oc apply -f -`, bypassing this local probe entirely. Never replace this
with `oc new-app`.

### `git-secret` must include `known_hosts`

The `git-secret` OpenShift secret must contain both `ssh-privatekey` AND `known_hosts`
so build pods can trust `github.com`. The `setup_ssh_keys()` function in
`scripts/lib/40-ssh.sh` runs `ssh-keyscan` and includes the result automatically.

If you need to patch an existing secret manually:

```bash
oc create secret generic git-secret \
  --from-file=ssh-privatekey="$HOME/.ssh/confused-deputy/ocp-key" \
  --from-literal=known_hosts="$(ssh-keyscan github.com 2>/dev/null)" \
  --type=kubernetes.io/ssh-auth \
  --dry-run=client -o yaml | oc apply -f -
```

### Add `github.com` to the local machine's known hosts

```bash
ssh-keyscan github.com >> ~/.ssh/known_hosts
```

### GitHub token (`_GITHUB_TOKEN`) permissions

The token must have the **`repo`** scope (or `public_repo` for public repos) to manage
deploy keys via the API. A token without this scope causes `HTTP 404` on deploy key
API calls — GitHub returns 404 (not 401) for insufficient scope.

---

## Vault: CrashLoopBackOff on Fresh Deployment

### Root cause

Vault starts **uninitialized** on first deploy. The liveness probe at
`/v1/sys/health?standbyok=true` returns HTTP **503** for an uninitialized instance.
After 3 failures Kubernetes kills the pod, creating an infinite crash loop before you
can ever run `vault operator init`.

### Fix (already applied in `scripts/lib/70-deployment.sh`)

Both readiness and liveness probes now include `uninitcode=204&sealedcode=204`:

```
/v1/sys/health?standbyok=true&uninitcode=204&sealedcode=204
```

This makes Vault return HTTP 204 (treated as healthy) when uninitialized or sealed,
giving you time to initialize it.

### Vault initialization (one-time, required after first deploy)

Vault must be initialized exactly once. The data is persisted in the `vault-data` PVC.

```bash
oc rsh deployment/vault

# Inside the pod:
vault operator init        # prints 5 unseal keys + 1 root token — SAVE THESE SECURELY
vault operator unseal <unseal-key-1>
vault operator unseal <unseal-key-2>
vault operator unseal <unseal-key-3>
vault login <root-token>
exit
```

After initialization, Vault will be sealed again on every pod restart. To unseal:

```bash
oc rsh deployment/vault
vault operator unseal <key1>
vault operator unseal <key2>
vault operator unseal <key3>
```

Then run `scripts/vault/scripts/vault-setup.sh` to configure JWT auth, MongoDB secrets
engine, and ACL policies (see `scripts/vault/README.md`).

---

## Frontend Build Failures

The frontend uses a bleeding-edge dependency stack (TypeScript 7, Tailwind CSS v4,
Vite 8). These versions have breaking changes from their v3/v6 predecessors.

### 1. `npm install` peer dependency conflict

**Error:**
```
npm error peer typescript@">=4.8.4 <6.1.0" from typescript-eslint@8.70.1
```

**Cause:** `typescript@7` conflicts with `typescript-eslint@8.x` peer dep range.

**Fix (already in `frontend/Dockerfile`):**
```dockerfile
RUN npm install --legacy-peer-deps
```

### 2. `Option 'baseUrl' has been removed` (TypeScript 7)

**Error:**
```
tsconfig.json(22,5): error TS5102: Option 'baseUrl' has been removed.
```

**Cause:** TypeScript 7 removed `baseUrl`. The `paths` alias works without it.

**Fix (already in `frontend/tsconfig.json`):** `baseUrl: "."` has been removed.
The `@/*` path alias still works via `paths` alone.

### 3. `tailwindcss` is not a PostCSS plugin (Tailwind CSS v4)

**Error:**
```
Error: It looks like you're trying to use `tailwindcss` directly as a PostCSS plugin.
The PostCSS plugin has moved to a separate package: @tailwindcss/postcss
```

**Cause:** Tailwind CSS v4 moved its PostCSS integration to `@tailwindcss/postcss`.

**Fix (already applied):**
- `frontend/package.json`: added `"@tailwindcss/postcss": "^4.3.3"` to devDependencies
- `frontend/postcss.config.js`: replaced `tailwindcss: {}` with `"@tailwindcss/postcss": {}`

### 4. `Cannot apply unknown utility class` in SCSS (Tailwind v4)

**Error:**
```
Cannot apply unknown utility class `border-cds-border-subtle`
```

**Cause:** Tailwind v4's `@apply` cannot resolve custom theme classes (defined in
`tailwind.config.js` via `theme.extend.colors`) when used inside an SCSS file that
uses `@use`. The Sass compilation context is separate from the PostCSS context.

**Fix (already in `frontend/src/styles/tailwind.scss`):**
Replace `@apply cds-*` with direct CSS custom property references:

```scss
/* Instead of: */
@apply border-cds-border-subtle;
@apply bg-cds-background text-cds-text-primary;

/* Use: */
border-color: var(--cds-border-subtle);
background-color: var(--cds-background);
color: var(--cds-text-primary);
```

### 5. `VITE_*` build args not injected

**Cause:** Docker only injects build args that are explicitly declared with `ARG` in
the Dockerfile. The original Dockerfile only declared `ARG VITE_API_URL`.

**Fix (already in `frontend/Dockerfile`):** All 7 `VITE_WXO_*` variables are now
declared as `ARG` in the `build-stage`:

```dockerfile
ARG VITE_API_URL
ARG VITE_WXO_HOST_URL
ARG VITE_WXO_ORCHESTRATION_ID
ARG VITE_WXO_AGENT_ID
ARG VITE_WXO_AGENT_ENVIRONMENT_ID
ARG VITE_WXO_DEPLOYMENT_PLATFORM
ARG VITE_WXO_CRN
ARG VITE_WXO_TENANT_ID
```

### 6. UI renders unstyled / logo appears oversized

**Symptom:** The login page loads but the logo fills the entire screen, layout has no
spacing, and utility classes like `flex`, `w-12`, `min-h-[100dvh]` have no effect.

**Cause:** Tailwind v4 with `@tailwindcss/postcss` **ignores the `content` array in
`tailwind.config.js`**. In v4, the `content` config key is a no-op in compatibility
mode — Tailwind uses its own auto-detection or explicit `@source` directives instead.
Because no `@source` was set, Tailwind v4 never scanned the TSX files and generated
zero utility classes in the output CSS.

**Fix (already in `frontend/src/styles/tailwind.scss`):**

```scss
@use "preflight.scss";

@source "../../**/*.{ts,tsx}";   /* ← tells Tailwind v4 where to scan for classes */

@tailwind base;
@tailwind components;
@tailwind utilities;
```

The path `../../**/*.{ts,tsx}` is relative to `src/styles/` and resolves to
`src/**/*.{ts,tsx}` — covering all components, routes, and hooks.

**Note:** `@source` must come **after** all `@use` rules (Sass ordering requirement)
and **before** `@tailwind` directives.

---

## Deployment Script Quick Reference

```bash
# Full deployment
./scripts/oc-deploy.sh

# Show all options
./scripts/oc-deploy.sh --help

# Rebuild with specific flavor
./scripts/oc-deploy.sh --flavor confused-deputy

# Regenerate SSH key (if deploy key is stale)
./scripts/oc-deploy.sh --regenerate-ssh-key

# Trigger individual builds without re-running the full script
oc start-build frontend -n confused-deputy
oc start-build backend  -n confused-deputy
oc start-build mcp      -n confused-deputy

# Watch a build log live
oc logs -f bc/frontend -n confused-deputy

# Check all pod statuses
oc get pods -n confused-deputy

# Check all build statuses
oc get builds -n confused-deputy --sort-by=.metadata.creationTimestamp
```

---

## Known Deployment Order Dependencies

1. **`git-secret`** must exist before any build starts (created by Phase 3)
2. **MongoDB** must be running before MCP starts (MCP reads from it)
3. **Vault** must be initialized and unsealed before MCP can fetch secrets
4. **Backend** must be deployed before its route URL is known (used in `confused-deputy-app-env` secret)
5. **`confused-deputy-app-env`** secret is updated after all routes exist (Phase 5 end)

---

## Issues found during the 2026-10-25 setup session

- **MCP route 503:** the `mcp` route targets port 8080 (nginx proxy) but the Service only exposed 8001.
  `create_app_from_git "mcp"` now uses port 8080. Live fix: `oc patch svc mcp --type=json -p '[{"op":"replace","path":"/spec/ports","value":[{"port":8080,"targetPort":8080,"protocol":"TCP"}]}]'`
  (`/sse` should return 401 without a token, `/health` 200).
- **Vault pod stuck in ContainerCreating:** `vault-data` is RWO, so a RollingUpdate can never attach the volume
  to the new pod. The Vault Deployment now uses `strategy: Recreate`. After any Vault restart, unseal again.
- **`VITE_WXO_TENANT_ID` is `<account-id>_<instance-id>`** (same value as the orchestration ID), not just the
  instance ID (WxO reports `tenant_id` in this form). With the bare instance ID the embedded chat shows "Agent fetching failed" (confirmed).
- **Embed security:** the WxO *Public key* field must contain `local/keys/public.pem` (your key), not the
  IBM-provided key. Wrong key => "Authentication Error" in the embedded chat.
- **IBM Verify (Custom Application template):** the UI hides *Client credentials* and *Token exchange*, but the
  API accepts them (`PUT /v1.0/applications/<id>`, `providers.oidc.properties.grantTypes`). Also required:
  web-app `clientAuthMethod` = `default` (not `private_key_jwt`) and agent-app automatic access
  (`POST /v1.0/owner/applications/<id>/entitlements {"birthRightAccess":true}`).
- **UI still unstyled after the `@source` fix (supersedes issue #6 above):** in Tailwind v4 the v3
  `@tailwind base/components/utilities` directives don't load the default theme or `tailwind.config.js`, so only
  theme-independent utilities were generated (no `p-6`, `max-w-sm`, `cds-*` colors) and the logo filled the screen.
  Tailwind now lives in plain CSS `frontend/src/styles/tailwind.css` (`@import "tailwindcss/theme.css"`,
  `@import "tailwindcss/utilities.css"`, `@config "../../tailwind.config.js"`, `@source`); `tailwind.scss` was removed
  and `preflight.scss` is imported from `main.tsx`.
- **Embedded chat layout:** `fullscreen-overlay` covered the app header (no logout) and WxO's own header links to
  `/analytics` (404 here, and the chat would not reload afterwards). The chat now uses `layout.form: "custom"` inside
  the `_layout` route (kept mounted, hidden on other routes) with `showOrchestrateHeader: false`.
- **Switching demo users:** web-app has no Verify single-logout configured, so logout clears the local session and the
  login request sends `prompt=login` to force the Verify sign-in form.
- **"Agent fetching failed" with every WxO call returning 400** (`/profiles/me`, `/api/v1/auth/ticket`,
  `.../environments/<id>/release`) after an agent re-import + deploy, while tenant ID and embed keys were correct:
  redeploying the agent again (`orchestrate agents import -f ... && orchestrate agents deploy --name ...`) fixed it.
  Root cause not identified. Check embed keys via `GET $SERVICE_INSTANCE/v1/embed/secure/config` (IAM token).
- **Read-Write user (Bob) denied on reads:** the MCP server picks the Vault DB role per *operation* (reads always
  use `database/creds/readonly`), but the `readwrite` policy only allowed `creds/readwrite`. The `readwrite` policy
  now also grants `database/creds/readonly` (in `vault-setup.sh`; live fix: `vault policy write readwrite ...`).
- **CRN lookup:** `orchestrate channels webchat embed` needs IBM Cloud resource-controller access; otherwise
  build the CRN as `crn:v1:bluemix:public:watsonx-orchestrate:<region>:a/<account-id>:<instance-id>::`.

---

*This file was last updated after the setup session on 2026-10-25.*
