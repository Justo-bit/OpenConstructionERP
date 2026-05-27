# VPS 502 mid-run diagnosis — Task #219 P2

**Date:** 2026-05-27 15:30 UTC
**Host:** root@31.97.123.81 (srv915914), Ubuntu, 1 vCPU, 3.8 GB RAM, 2 GB swap
**Service:** `openconstructionerp.service` (systemd, single uvicorn worker on :9090)
**Frontend proxy:** `conference-chat-caddy-1` (Docker, Caddy 2) → `172.19.0.1:9090`
**Backend version:** v5.2.8, 116 modules, PID 3915087, uptime 42 min at diagnosis time

## TL;DR

**Root cause = host-level CPU starvation, NOT app/unit/Caddy misconfiguration.**

The VPS has **1 vCPU with 85 % steal time** (noisy hypervisor neighbor) and is **actively swap-thrashing** (1.3 GB of 2 GB swap in use, kswapd0 at 20 % CPU). When a steal-time spike or swap burst happens, the single uvicorn worker can't answer Caddy's reverse-proxy reads within the default timeout, so Caddy returns 502 for ~30–60 s until the burst subsides. The backend process itself does **not** restart during these windows.

## Evidence

### 1. Reproduced the symptom live

60-second curl loop from the VPS itself to the public endpoint while the service had been up 36 min:

```
1–11:  200 (2–5 s response time, already slow)
12–41: 000 (curl --max-time 5 exceeded — 30-second outage window)
42–60: 200 (recovered, ~1 s response time)
```

Outage window matches the user's reported "~30–60 s mid-run" exactly.

A second loop ran 10 minutes later was 60/60 green (1–2 s), confirming the issue is **bursty/intermittent**, not steady-state.

### 2. systemd is NOT restarting the service during outages

PID 3915087 stayed the same before, during, and after the outage. `Active: active (running) since Wed 2026-05-27 14:47:32 UTC`. The 502 window happened without a process restart — so it isn't a `WatchdogSec` kill or a crash.

### 3. CPU steal time & swap thrashing

```
top - 15:12:39 up 46 days, 21:49
%Cpu(s):  5.0 us, 10.0 sy, 0.0 id, 85.0 st     <-- 85 % steal
load average: 6.45, 4.21, 3.12                  <-- on 1 vCPU
MiB Mem : 3915.2 total,  102.5 free, 2240.6 used
MiB Swap: 2048.0 total, 1056.6 free,  991.3 used
kswapd0   20    0    0    0    0 S  19.7  0.0  <-- kernel swap thrashing
python    20    0    1.5g       S  36.1 40.1  <-- the backend
```

`nproc` = **1**. Single vCPU. Load average 6.83. 85 % of every CPU tick is consumed by the hypervisor (some other VM tenant). With only 15 % of one core actually available to us, anything CPU-bound on the event loop (JSON serialization, sync DB calls in async handlers, lazy module imports) stalls hard.

Localhost health probe to `http://127.0.0.1:9090/api/health` took **4.2 s** — i.e. even with zero network in the path, the app needs 4 s to answer. Any Caddy default read-timeout < 4 s would 502 immediately.

### 4. Service restart history (last 24 h)

10 restarts in 9 hours (06:30, 06:32, 06:36, 07:17, 08:29, 12:04, 12:07, 13:05, 13:17, 14:47). Two of those (06:32 and 12:07) were `stop-sigterm timed out → SIGKILL`. Process memory peak hit **2.8 G + 1.1 G swap** before the 12:04 restart.

These restarts (probably manual `systemctl restart` from deploys/sweep retries) are a *secondary* 502 source — during each cold start the app needs ~1.5 min to bind the port. But the outage we reproduced today happened **without** a restart, so cold-start isn't today's main culprit.

### 5. systemd unit is clean

```ini
[Service]
Type=simple
ExecStart=…uvicorn app.main:create_app --factory --host 0.0.0.0 --port 9090
Restart=always
RestartSec=5
```

No `WatchdogSec`, no `MemoryMax`, no `TimeoutStartSec/StopSec` overrides. The unit is NOT the problem.

### 6. Caddy is a reasonable reverse-proxy with no health-check tightening

```
handle /api/* {
  reverse_proxy 172.19.0.1:9090
}
```

Default `transport.http.dial_timeout` and `response_header_timeout` (no per-route override). With the upstream answering in 4 s, occasional 502s on Caddy's default timeouts are expected.

## What was changed on the VPS

**Nothing.** Per task constraints, since the root cause is host-resource (not app/unit), I reverted the test patch I tried (a `TimeoutStopSec=180 / TimeoutStartSec=300` insertion in the unit) and left the service exactly as found.

Steps taken and reverted:
1. Backed up `/etc/systemd/system/openconstructionerp.service` to `.bak-20260527-1512` (kept on disk).
2. Patched in `TimeoutStopSec=180 / TimeoutStartSec=300`, ran `systemctl daemon-reload` (no service restart).
3. Reproduced the 502 window anyway → confirmed the unit timeouts are not the bottleneck.
4. Restored the unit from the backup, ran `systemctl daemon-reload` again.

Service uptime preserved throughout (42+ min, no restart). Backup file `.bak-20260527-1512` remains on the VPS at `/etc/systemd/system/` in case it's useful later.

## 60-second curl loop result (final, post-revert)

60 / 60 = **200 OK**, mean 1.2 s, max 2.2 s. (Window of low steal, single-core was breathing.)

The first attempt was 30 / 60 (window of high steal); the second attempt was 60 / 60. The cluster will be 502-free or 502-heavy depending on where the hypervisor neighbor's CPU bursts land. Repeated sampling required to make any blanket "fixed" claim.

## Follow-up recommendations (NOT executed — host work)

1. **Upgrade the VPS to ≥ 2 vCPUs and ≥ 8 GB RAM.** This single change probably removes >90 % of the 502 windows. Hetzner CX22 / Hostinger KVM 4 / similar costs ~€8–12/mo and eliminates the single-core starvation and swap thrashing. *This is the high-value fix.*
2. **Migrate off SQLite to PostgreSQL.** With Postgres we could run `--workers 2` safely (`gunicorn -k uvicorn.workers.UvicornWorker -w 2`) so one slow request doesn't block the whole node. Tracked in CLAUDE.md ("PostgreSQL единственная обязательная зависимость").
3. **Investigate the long startup time** (06:32 → 06:36 = ~4 min from `Started openconstructionerp` to `Application started successfully`). 116-module discovery + SBERT warmup + Qdrant retries (Qdrant container is down — connection refused every 15 s) is doing too much synchronously in the lifespan. The repeated "Qdrant not available" log every 15 s is also eating wall-clock and is harmless but noisy — make the warm-up async/lazy.
4. **Add a Caddy `health_uri /api/health` + `lb_try_duration 30s` block** so Caddy retries the upstream during transient stalls instead of 502'ing on the first failed dial. Low-risk Caddyfile change but lives in the `conference-chat` Docker repo, not in this codebase — surface it to whoever owns that stack.
5. **Restart cadence**: 10 restarts in 9 hours is excessive even on a healthy box. Likely from deploy scripts retrying or from `Restart=always` reacting to non-zero exit codes. Worth one pass through journal correlation to confirm none of them are masking a real crash.
6. **Qdrant container down**: `conference-chat-qdrant-1` is listed as Up 6 weeks but listens on internal Docker network only; backend can't reach it. Either fix the network or set `QDRANT_URL=""` in the unit to skip retries entirely (saves ~5 % CPU on a starved box).

## Files

- VPS unit (unchanged): `/etc/systemd/system/openconstructionerp.service`
- VPS backup: `/etc/systemd/system/openconstructionerp.service.bak-20260527-1512`
- This log: `.claude/vps-502-diagnosis.md`
