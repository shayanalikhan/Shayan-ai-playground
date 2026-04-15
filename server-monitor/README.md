# Server Monitor Dashboard

Minimal live dashboard for this host.

## What it shows

- CPU, RAM, disk, uptime
- Network latency and HTTP reachability
- Listening ports and failed services
- OpenClaw status, audit warnings, update state
- Recent auth anomalies and system errors
- High-signal security alerts

## Start it

```bash
npm run monitor:dashboard
```

Then open:

- <http://127.0.0.1:18890>

## One-shot snapshot

```bash
npm run monitor:snapshot
```

## Notes

- It is loopback-only by default.
- It refreshes every 15 seconds.
- Full bandwidth testing is not enabled yet because no speedtest CLI is installed on this host.
- Expensive checks are cached briefly so the dashboard stays responsive.
