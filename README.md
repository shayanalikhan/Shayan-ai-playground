# Shayan-ai-playground

A public repo for Shayan's AI-assisted experiments, tools, and small systems projects.

The goal is simple: build useful things, keep them versioned, and let the repo grow into a clean catalog of real work.

## What is in here right now

### `server-monitor/`
A minimal live monitoring dashboard for the OpenClaw host.

It currently tracks:
- CPU, RAM, disk, and uptime
- network latency and HTTP reachability
- listening ports and failed services
- OpenClaw status, audit warnings, and update state
- recent auth anomalies and system log errors
- high-signal security alerts

## Quick start

From the repo root:

```bash
npm run monitor:dashboard
```

Useful commands:

```bash
npm run monitor:snapshot
npm run monitor:json
```

The dashboard can be started on different bind addresses depending on how you want to reach it, for example loopback-only or a Tailscale address.

## Repo structure

```text
.
├── server-monitor/        # Monitoring dashboard project
├── CONTRIBUTING.md        # Workflow notes for future work
├── package.json           # Top-level helper scripts
└── README.md              # Repo homepage
```

## Project philosophy

This repo is meant to stay:
- practical
- readable
- easy to run again later
- safe to share publicly

That means:
- each project gets its own folder
- secrets and machine-specific private data stay out of git
- small focused commits are preferred over giant dumps
- every project should explain what it does and how to run it

## Working with Chico

This repo is designed to work well with AI-assisted development.

Typical flow:
1. Pick a project idea
2. Create or update a project folder
3. Review the changes
4. Commit locally
5. Push when it is ready to be public

## Roadmap

Likely future additions:
- more monitoring and automation tools
- personal infrastructure utilities
- experiments that start small and get refined over time

## Notes

- The current monitor is intentionally lightweight and uses only built-in Node modules.
- Cached probe output is ignored by git.
- If a project exposes sensitive infrastructure details, it should be sanitized before publishing.
