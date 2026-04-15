# Contributing / Working With Chico

This repo is the public home for Shayan's AI-assisted experiments.

## Ground rules

- Keep secrets, tokens, personal config, and machine-specific private files out of git.
- Prefer small focused commits.
- Keep each project self-contained in its own folder.
- Document how to run each project from its own README.

## Suggested layout

- `server-monitor/` - monitoring dashboard and related scripts
- future projects can live beside it at the repo root or under their own folders

## Typical workflow

1. Make changes in a project folder
2. Review diff
3. Commit locally
4. Push to GitHub when ready

## For AI-assisted work

- Chico can edit files, organize code, and prepare commits locally
- Pushes to GitHub should still be intentional, especially for a public repo
- If a project may expose infrastructure details, sanitize it before publishing
