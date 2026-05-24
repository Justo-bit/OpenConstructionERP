# Fresh-Install Runbook — OpenConstructionERP (Local Development)

> **Audience**: a new developer cloning the repo for the first time on
> Windows 11, macOS, or Linux who wants to run the full stack locally
> from `git clone` to a logged-in browser session.
>
> **Scope**: local development against SQLite + the bundled in-memory
> cache + Vite dev server. **NOT** a production deployment guide — for
> the production VPS path, see `docs/qa/` (none yet) and the project's
> deploy scripts. Specifically, this runbook deliberately does NOT cover:
> - the wheel-shadowed-by-source rsync dance the VPS systemd unit needs
>   (irrelevant: editable install + Vite dev server load source directly)
> - the absolute-path `DATABASE_SYNC_URL` override required on the VPS
>   (irrelevant: local `cd backend && alembic upgrade head` resolves the
>   alembic.ini relative path correctly)
> - the `pyproject.toml`-must-ship-with-the-tarball rule
>   (irrelevant: git clone gives you the whole tree)
> - the `_frontend_dist`-vs-`frontend/dist` precedence trap
>   (irrelevant: the editable install does not bundle `_frontend_dist`)
>
> **Time budget**: ~15 minutes total on a warm-cache modern laptop.
> First-time pip + npm installs over a slow link push this toward 30
> minutes.
>
> **Total wall-clock observed**: 14 m 17 s on Windows 11 / Python 3.13.9 /
> Node v24.14.1 / 1 Gb/s residential link (see `FRESH_INSTALL_RESULTS.md`).

---

## 0 · Prerequisites

| Tool       | Min version | Check command          | Time   |
| ---------- | ----------- | ---------------------- | ------ |
| Python     | 3.12        | `python --version`     | 0 min  |
| Node.js    | 20.x        | `node --version`       | 0 min  |
| npm        | 10.x        | `npm --version`        | 0 min  |
| git        | any         | `git --version`        | 0 min  |
| free RAM   | 4 GB        |                        | —      |
| free disk  | 2 GB        |                        | —      |

No Docker, no Postgres, no Redis, no MinIO required. The local stack uses
SQLite (file-backed), in-memory cache, and the host filesystem for blobs.
You can graduate to the production stack later via `pip install
'openconstructionerp[server]'` and `docker compose up`.

> **Windows users**: use PowerShell or Git Bash. CMD works but the
> activation script paths differ. Examples below give PowerShell first
> and POSIX bash second when they diverge.

---

## 1 · Clone the repo  (~30 s)

**PowerShell / bash (same)**:

```bash
git clone https://github.com/datadrivenconstruction/OpenConstructionERP.git
cd OpenConstructionERP
git rev-parse HEAD          # record the SHA for reproducibility
```

**Expected**: `Cloning into 'OpenConstructionERP'... done.` Then the SHA.
The repo is ~80 MB checked out (4023 files).

---

## 2 · Create + activate a Python venv  (~10 s)

**PowerShell**:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
```

**Bash (Git Bash, WSL, macOS, Linux)**:

```bash
python -m venv .venv
source .venv/bin/activate            # or: source .venv/Scripts/activate on Git Bash
python -m pip install --upgrade pip
```

**Expected**: prompt prefixed with `(.venv)`. `pip --version` reports
`pip 26.x` or newer from inside the venv.

> **Why a venv**: the editable install will pull in ~60 packages
> including pandas, numpy, pyarrow, duckdb, ezdxf, trimesh, reportlab,
> SQLAlchemy 2, FastAPI 0.136 and uvicorn. Polluting the system
> Python wastes RAM and risks version pinning conflicts with other
> projects. On Ubuntu 23.04+ / Debian 12+, system pip refuses to
> install at all (PEP 668 `externally-managed-environment`).

---

## 3 · Install backend in editable mode  (~3-5 min)

### 3a · Pre-flight: create the `frontend/dist` placeholder

The backend `pyproject.toml` declares the pre-built frontend as a forced
inclusion for the wheel build target. Hatchling currently consults that
inclusion map even for the editable target (see Troubleshooting → "Forced
include not found" below). Work around it with a one-byte placeholder:

**PowerShell**:

```powershell
New-Item -ItemType Directory -Force frontend\dist | Out-Null
New-Item -ItemType File -Force frontend\dist\.placeholder | Out-Null
```

**Bash**:

```bash
mkdir -p frontend/dist
touch    frontend/dist/.placeholder
```

You will overwrite this with a real Vite build only if you decide to
serve the SPA from the backend (production-style); for development you
just need the directory to exist.

### 3b · Install the backend

**PowerShell / bash (same)**:

```bash
pip install -e ./backend
```

**Expected**: ~60 packages downloaded, ending with
`Successfully installed ... openconstructionerp-4.6.1 ...`. Total wheel
download is ~150 MB, install size ~400 MB.

The version printed in `Successfully installed openconstructionerp-X.Y.Z`
must match `backend/pyproject.toml` line `version = "..."`. If it does
not, your editable install picked up a cached older wheel — clear with
`pip cache purge` and retry.

**Sanity check** (no startup, no DB write — purely import-time):

```bash
python -c "from app.main import create_app; from app.config import get_settings; print('version:', get_settings().app_version)"
```

**Expected**: `version: 4.6.1` (or whatever's in `backend/pyproject.toml`).
A `JWT_SECRET is the bundled development default` warning is normal in
local dev — it means the backend rotated to a random per-process secret.

---

## 4 · Run alembic migrations  (~5 s)

**PowerShell / bash (same)**:

```bash
cd backend
python -m alembic upgrade head
python -m alembic current
cd ..
```

**Expected**:

```
INFO  [alembic.runtime.migration] Context impl SQLiteImpl.
INFO  [alembic.runtime.migration] Will assume non-transactional DDL.
v3123_boq_fk_indexes (head)
```

The alembic head revision identifier changes as the project evolves —
it should match `git log -1 --format=%s backend/alembic/versions/v3*.py`
on the most recent migration file. The current main HEAD ships
**`v3123_boq_fk_indexes`** as the head.

A new SQLite file appears at `backend/openestimate.db` (~1.5 MB after
migrations, no seed data yet).

> **Note**: unlike the production VPS, here we do NOT need to set
> `DATABASE_SYNC_URL`. The CLI inherits the alembic.ini default
> `sqlite:///./openestimate.db`, which (relative to `cwd=backend/`)
> resolves to `backend/openestimate.db` — the same file the backend
> opens at boot via its default `database_url` in `app/config.py`.
> If you ever see "alembic_head_matches=false" in `/api/health`, you
> are pointing alembic and the backend at different DB files. Fix by
> always running alembic from inside `backend/` (the recommended way),
> or by exporting `DATABASE_SYNC_URL=sqlite:///./openestimate.db`
> before the alembic call.

---

## 5 · Install frontend dependencies  (~1-2 min)

**PowerShell**:

```powershell
Remove-Item -Recurse -Force frontend\dist        # drop the placeholder
cd frontend
npm install --no-audit --no-fund
cd ..
```

**Bash**:

```bash
rm -rf frontend/dist                              # drop the placeholder
cd frontend
npm install --no-audit --no-fund
cd ..
```

**Expected**: `added 1033 packages in <time>`. Several `npm warn
deprecated` lines are normal (transitive lodash / glob / uuid / inflight
warnings from third-party tooling). No `npm error` lines.

Install footprint: `frontend/node_modules/` ≈ 700 MB.

---

## 6 · (Optional) Seed demo data  (~15-30 s)

The backend will auto-seed three demo users on first boot. To also load
five pre-built showcase projects (Berlin, London, New York, Paris,
Dubai), run:

```bash
cd backend
python -m app.scripts.seed_demo_showcase
cd ..
```

**Expected**: log lines ending with `Seed complete.` Skip this for the
shortest path — you can still log in and create projects manually.

The CWICR cost catalogues (55 000+ rates) are NOT seeded by default;
they install on demand from the **Cost Database** page in the UI
(or via `POST /api/v1/costs/catalogues-v3/{id}/install`).

---

## 7 · Start the backend  (~15-20 s to "ready")

Open **terminal 1** at the repo root.

**PowerShell**:

```powershell
cd backend
..\..venv\Scripts\Activate.ps1                   # if not already active
python -m uvicorn app.main:create_app --factory --reload --port 8000
```

**Bash**:

```bash
cd backend
source ../.venv/bin/activate                     # if not already active
python -m uvicorn app.main:create_app --factory --reload --port 8000
```

**Expected log lines** (~15-20 s end-to-end):

```
=== OpenConstructionERP ===
Starting OpenConstructionERP v4.6.1 (env=development)
=== i18n ===
Loaded 26 locales: ['ar', 'bg', 'cs', ...]
=== Database ===
Loading 101 modules in order: ['oe_users', 'oe_projects', ...]
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
INFO:     Application startup complete.
```

The full module loader runs ~10 seconds — wait for `Application startup
complete` before issuing requests. `--reload` adds a watchdog that
restarts the process on `app/` file changes; drop it for a faster boot
when you're not editing backend code.

**Smoke test from a second terminal**:

```bash
curl -s http://127.0.0.1:8000/api/health
```

**Expected JSON** (whitespace added for readability):

```json
{
  "status": "degraded",
  "version": "4.6.1",
  "env": "development",
  "modules_loaded": 112,
  "database": "ok",
  "alembic_head_matches": true,
  "frontend_dist_present": false,
  "threads": 7
}
```

`status: "degraded"` here is **expected and normal in development** —
it triggers because `frontend_dist_present: false` (the backend would
serve the SPA itself if a Vite build existed). Vector DB
(`vector_db.status: offline`) also degrades the report but is optional.
What matters:

| Field                  | Required value          |
| ---------------------- | ----------------------- |
| `version`              | matches `pyproject.toml` |
| `modules_loaded`       | ≥ 110 (currently 112)   |
| `database`             | `"ok"`                  |
| `alembic_head_matches` | `true`                  |

---

## 8 · Start the frontend dev server  (~2 s)

Open **terminal 2** at the repo root.

**PowerShell / bash (same)**:

```bash
cd frontend
npm run dev
```

**Expected**:

```
  VITE v6.4.2  ready in <ms>
  ➜  Local:   http://127.0.0.1:5180/
```

> **README says `:5173`, the actual port is `:5180`.** `vite.config.ts`
> hard-codes `server.port = 5180` and `strictPort = true`. Open
> http://127.0.0.1:5180 — opening :5173 will time out.

The dev server proxies `/api/*` to `http://127.0.0.1:9090` by default
(set in `vite.config.ts`). Since step 7 starts the backend on `:8000`,
**point the proxy at the right backend**:

**PowerShell**:

```powershell
$env:VITE_API_TARGET = "http://127.0.0.1:8000"
npm run dev
```

**Bash**:

```bash
VITE_API_TARGET=http://127.0.0.1:8000 npm run dev
```

Without that env var the proxy 502s on every API call because port 9090
is empty in a fresh setup.

---

## 9 · Log in & manual smoke test  (~30 s)

1. Open http://127.0.0.1:5180/login in a browser.
2. The login page should render the OpenConstructionERP brand and a
   three-tab role selector (Admin / Estimator / Manager).
3. **Credentials**: read the auto-generated password from
   `~/.openestimator/.demo_credentials.json` — the README's quoted
   `DemoPass1234!` only works if you exported
   `DEMO_USER_PASSWORD=DemoPass1234!` BEFORE the first boot.

   **PowerShell**:
   ```powershell
   Get-Content $HOME\.openestimator\.demo_credentials.json
   ```

   **Bash**:
   ```bash
   cat ~/.openestimator/.demo_credentials.json
   ```

   Look up `demo@openestimator.io` (note the trailing **`r`** — a common
   typo is `openestimate.io` which silently returns 401 because that
   user does not exist).

4. Click Login. You should land on `/dashboard`.

5. Manually visit each of:
   - `/property-dev`
   - `/boq`
   - `/bim`
   - `/geo`
   - `/settings/converters`

   Each should render its module shell with no red error screen and
   no uncaught console exceptions. Empty data states (no projects yet)
   are expected.

6. Open the sidebar (left rail). You should see at least 40 module
   entries, organised by category. Module count surfaced by the API
   should match `/api/system/modules` (admin-only — needs the token
   from the JSON login response).

---

## 10 · Verification one-liners

These confirm the install actually delivered what we wanted. Run them
from a third terminal with the backend up.

```bash
# 1. /api/health 200 + version + modules + alembic
curl -s http://127.0.0.1:8000/api/health | python -m json.tool

# 2. login + grab token (Linux/macOS/Git Bash, with jq)
PW=$(python -c "import json,os;print(json.load(open(os.path.expanduser('~/.openestimator/.demo_credentials.json')))['demo@openestimator.io'])")
TOKEN=$(curl -s -X POST http://127.0.0.1:8000/api/v1/users/auth/login/ \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"demo@openestimator.io\",\"password\":\"$PW\"}" \
  | python -c "import json,sys;print(json.load(sys.stdin)['access_token'])")

# 3. /api/system/modules — needs admin token
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8000/api/system/modules \
  | python -c "import json,sys;d=json.load(sys.stdin);print('modules:',len(d['modules']))"
```

**Expected**:
- `/api/health` returns 200 with `modules_loaded: 112` and
  `alembic_head_matches: true`.
- `/api/system/modules` returns 112 entries, of which 101 are
  `enabled: true` by default.

---

## Troubleshooting

### "Forced include not found: …/frontend/dist" during `pip install -e ./backend`

**Symptom**:

```
FileNotFoundError: Forced include not found:
   .../frontend/dist
error: metadata-generation-failed
```

**Cause**: `backend/pyproject.toml` has both a wheel `force-include` map
(`"../frontend/dist" = "app/_frontend_dist"`) and an editable target that
tries to inherit nothing — but at least one hatchling version still
walks the wheel map during editable metadata generation.

**Fix**: ensure `frontend/dist/` exists before the install (step 3a
above). A directory with one placeholder file is enough; the editable
install does not actually bundle the contents.

### `/api/v1/users/auth/login/` returns `Invalid email or password`

**Cause**: you're using a password that doesn't match the
auto-generated one. Solutions in order of preference:

1. Read `~/.openestimator/.demo_credentials.json` and use that password.
2. Set `DEMO_USER_PASSWORD=DemoPass1234!` (and the matching
   `DEMO_ESTIMATOR_PASSWORD` / `DEMO_MANAGER_PASSWORD`) **before** the
   first backend boot, delete `backend/openestimate.db`, and start the
   backend again — that re-seeds the demo accounts with your password.
3. Double-check the email: it must be `demo@openestimator.io`
   (with the trailing `r`). `demo@openestimate.io` (no `r`) does not
   exist and silently returns 401.

### `/api/system/modules` returns `{"detail":"Not authenticated"}`

**Cause**: it's an admin-only endpoint. Solution: log in as
`demo@openestimator.io` (admin) and pass `Authorization: Bearer <token>`
header.

### Vite dev server starts but every API call 502s

**Cause**: `vite.config.ts` proxies `/api/*` to
`http://127.0.0.1:9090` by default, but you're running the backend on
:8000. Solution: set `VITE_API_TARGET=http://127.0.0.1:8000` before
`npm run dev` (step 8).

### `EADDRINUSE` on port 5180 or 8000

**Cause**: another instance of the app is already running on the same
port. `vite.config.ts` uses `strictPort: true`, so it will not pick a
fallback automatically. Solutions:

- Find and stop the colliding process: `netstat -ano | grep :8000`
  (Windows) or `lsof -i :8000` (Linux/macOS), then kill it.
- Or run the backend on a different port: `--port 8001` for uvicorn
  + `VITE_API_TARGET=http://127.0.0.1:8001` for Vite.
- For Vite, change `server.port` in `vite.config.ts` (no env override
  exists for this; the file hard-codes it).

### Backend boot hangs at "Loading 101 modules"

**Cause**: usually a stuck import in one of the auto-discovered modules.
Watch the log — the last "Module X loaded" tells you which one wedged.

Mitigations:
- Drop `--reload` so the watchdog isn't spawning duplicate processes.
- Disable a flaky module by adding it to the `disabled_modules` set
  via the admin UI, or by editing
  `~/.openestimator/data/module_state.json` and re-starting.

### "OMP: Error #15: Initializing libiomp5md.dll" (Windows + Anaconda)

**Cause**: numpy bundled with Anaconda ships its own libiomp5, and the
backend tries to load another copy via torch/lancedb.

**Fix**: this is already handled in `app/main.py` via
`KMP_DUPLICATE_LIB_OK=TRUE`. If you still see it, ensure no other
parent process clobbered the env var, and run the backend in a clean
venv (not the Anaconda base env).

### `frontend_dist_present: false` in `/api/health`

**Not a problem in development.** It only matters when you want the
backend to serve the SPA itself (production-style, no Vite). Build
the frontend with `cd frontend && npm run build` and the file appears
at `frontend/dist/index.html`, then a backend restart picks it up.

### "alembic_head_matches: false"

**Cause**: the DB has migrations that the source tree does not have
(you downgraded the code), or vice versa (you forgot step 4).

**Fix**: run `cd backend && python -m alembic upgrade head` again.
If that says "head is up to date" but the API still reports false,
you have the alembic CLI pointing at the wrong DB file (very rare
in local dev — typically only happens with explicit env var overrides).
Verify with:

```bash
cd backend
python -c "from app.config import get_settings; print(get_settings().database_sync_url)"
python -m alembic current
```

Both should reference the same `openestimate.db` path.

---

## Cleanup (optional)

To wipe everything and start over:

```bash
deactivate                           # leave the venv first
rm -rf .venv frontend/node_modules frontend/dist backend/openestimate.db
rm -rf ~/.openestimator              # purges demo creds + cached blobs
```

Then restart from step 2.

---

## Wall-clock budget summary

| Step                         | Cold cache  | Warm cache |
| ---------------------------- | ----------- | ---------- |
| 1 · clone                    | 30 s        | 5 s        |
| 2 · venv + pip upgrade       | 10 s        | 10 s       |
| 3 · backend editable install | 3-5 min     | 30 s       |
| 4 · alembic upgrade head     | 5 s         | 5 s        |
| 5 · npm install              | 1-2 min     | 10 s       |
| 6 · seed demo (optional)     | 30 s        | 30 s       |
| 7 · backend startup          | 15-20 s     | 15-20 s    |
| 8 · vite startup             | 2 s         | 2 s        |
| 9 · login + smoke test       | 30 s        | 30 s       |
| **Total**                    | **~12 min** | **~3 min** |

Observed clean-room run on Windows 11 / Python 3.13.9 / Node v24.14.1 /
1 Gb/s residential link, with `pip cache` and `npm cache` already warm:
**14 m 17 s** end-to-end including all verification steps and writing
this runbook's companion `FRESH_INSTALL_RESULTS.md`.
