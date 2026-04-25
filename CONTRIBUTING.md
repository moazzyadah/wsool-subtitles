# Contributing

Thanks for your interest in wsool-subtitles. Quick notes before you open a PR.

## Adding a new STT provider

1. Add a class in `src/lib/providers/<id>.ts` that exports a `STTProvider`.
   Implement `start()` and (for async providers) `poll()`.
2. Add an entry to `PROVIDERS` in `src/lib/providers/registry.ts` with model
   list, capabilities, and pricing.
3. Wire it into `_runtimeRegistry` at the bottom of the same file.
4. Add an env var in `.env.example` with a comment pointing to where to get a key.
5. Open a PR. Include a screenshot of a 30-second test transcription.

Keep each provider <150 lines. If your transport repeats a pattern that
already exists in another provider, extract a helper instead of copy-pasting.

## Style

- TypeScript strict mode is on.
- No `any`. Use `unknown` and narrow.
- Never use `dangerouslySetInnerHTML` for any user-controlled string.
- Server-only code goes in `src/lib/` and starts with `import 'server-only';`.
- All file-system writes must go through `safeJoin()` from `src/lib/upload.ts`.
- All FFmpeg invocations must use `fluent-ffmpeg`'s typed API. Never `exec()` a shell string.

## Testing your changes locally

```bash
npm run typecheck
npm run lint
npm run smoke:libass    # confirms FFmpeg + libass + Cairo font work end-to-end
npm run dev
```

## Reporting bugs

- Provide the transcript of the error from `console` (server) and DevTools (client).
- Redact API keys before posting.
- Mention which provider you were using and which model.
