# Shayan-ai-playground

A public playground repo for Shayan's AI-assisted experiments and tools.

## Included now

- `server-monitor/` - minimal live monitoring dashboard for the OpenClaw host

## Server monitor

Run locally on the server:

```bash
npm run monitor:dashboard
```

Useful commands:

```bash
npm run monitor:snapshot
npm run monitor:json
```

Dashboard default URL depends on the bind address used when starting it.
Examples:

- loopback only: `http://127.0.0.1:18890`
- Tailscale IP: `http://100.96.80.50:18890`

## Notes

- The dashboard is intentionally minimal and uses only built-in Node modules.
- Cached probe data is kept out of git.
- Future projects can live alongside this one in the same repo.
