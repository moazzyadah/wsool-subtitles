# Security Policy

## Reporting a vulnerability

If you find a security issue, please **do not open a public GitHub issue**.
Email security@wsool.ai with the details. We aim to respond within 72 hours.

## Threat model

This is a **localhost-only tool**. By default it refuses any request whose
`Host` header is not `localhost` or `127.0.0.1`. Setting `ALLOW_LAN=true`
disables that guard — only do this if you understand the implications
(anyone on your network can then submit jobs and consume your provider
API credits).

## Hardening already in place

- Server-side UUID job IDs (`crypto.randomUUID`) — never trusted from client
- Strict regex validation on every `[jobId]` path parameter
- File uploads sniffed by magic bytes (`file-type`); MIME spoofing rejected
- Streaming byte counter aborts uploads that exceed `MAX_UPLOAD_MB`
- All FFmpeg invocations use `fluent-ffmpeg`'s `execFile` API, never shell strings
- libass `force_style` values are whitelisted (font ∈ allowed list, colors match strict regex, sizes bounded)
- libass override blocks `{...}` are stripped from user-edited subtitle text before the SRT is written
- API keys are server-only via `import 'server-only'` in `src/lib/config.ts` — Next.js will fail the build if any client component imports it
- Errors are sanitized (`sanitizeError`) before being returned to the client; long opaque tokens that look like API keys are redacted

## What is NOT in scope

- Multi-user authentication (this is a single-user local tool)
- Cloud deployment (the localhost guard makes that explicitly hostile)
- Encrypted at-rest storage of `.env` (use OS-level disk encryption)

## Updating

When a dependency CVE affects this project, we'll cut a patch release.
Pin to a specific commit if you want reproducibility.
