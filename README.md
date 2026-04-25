# wsool-subtitles

Universal multi-provider video subtitle generator. **14 STT providers**, **30+ models**, full **Egyptian Arabic dialect** support, and a **fully-local whisper.cpp** mode that needs no API keys.

Built locally first — no SaaS, no telemetry, no auth. Clone, run, transcribe.

> [العربية أدناه](#wsool-subtitles--بالعربية)

## Features

- Drop a video → get editable SRT/VTT + burned-in MP4
- Pick any of: Local whisper.cpp · Groq · Deepgram · Replicate (with Egyptian Arabic HF fine-tunes) — and more on the way
- Async-first job worker handles long-running providers (Replicate predictions, AssemblyAI, Speechmatics) cleanly
- sha256-keyed cache: re-run the same audio on the same provider → instant + free
- libass + bundled Cairo/Tajawal/IBM Plex Sans Arabic fonts for proper Arabic glyph rendering when burning subs
- Localhost-only by default — won't accidentally expose your provider keys to your LAN

## Quick start

```bash
git clone https://github.com/wsool-ai/wsool-subtitles.git
cd wsool-subtitles
npm install
cp .env.example .env
chmod 600 .env       # fill in any provider keys you have, or skip and use Local

npm run fonts:download    # one-time: pull Cairo/Tajawal/IBM Plex Sans Arabic
npm run smoke:libass      # gate: confirm FFmpeg can render Arabic glyphs

npm run dev
# open http://localhost:3000
```

### Run with zero API keys

The **Local** provider uses [whisper.cpp](https://github.com/ggerganov/whisper.cpp) and downloads a model (~75MB to ~3GB depending on size) on first use. Install whisper.cpp first:

```bash
# macOS
brew install whisper-cpp

# Ubuntu/Debian (build from source — see whisper.cpp docs)
# Windows: download from https://github.com/ggerganov/whisper.cpp/releases
```

Then in the UI, pick **Local (whisper.cpp)** and start transcribing. No API keys required.

## Providers

Set the relevant env var in `.env` to enable each. Missing key → provider hidden from UI.

| Provider | Env key | Notes |
|----------|---------|-------|
| Local whisper.cpp | _none_ | Offline, free. Needs `whisper-cli` on PATH |
| Groq | `GROQ_API_KEY` | Cheapest hosted Whisper. 7,200 sec/day free tier |
| OpenAI | `OPENAI_API_KEY` | Whisper-1 + gpt-4o-transcribe. 25 MB cap |
| Together AI | `TOGETHER_API_KEY` | Whisper-large-v3 hosted cheaply. $1 free credit |
| Fireworks | `FIREWORKS_API_KEY` | Cheapest batch Whisper. OpenAI-compatible |
| Fal.ai | `FAL_KEY` | Cheapest hosted variant. Pay-per-second |
| HuggingFace | `HF_TOKEN` | Direct access to Egyptian fine-tunes. ≤30s clips |
| Google Gemini | `GEMINI_API_KEY` | Long-form (up to 9.5h). Free tier available |
| ElevenLabs | `ELEVENLABS_API_KEY` | Strong MSA quality + word timestamps |
| AssemblyAI | `ASSEMBLYAI_API_KEY` | Quality + code-switching. $50 credit |
| Speechmatics | `SPEECHMATICS_API_KEY` | Explicit Egyptian Arabic. 8h/mo free |
| Soniox | `SONIOX_API_KEY` | Best Arabic WER (16.2%, incl. Egyptian). $200 credit |
| Deepgram | `DEEPGRAM_API_KEY` | Production Arabic incl. Egyptian. $200 credit |
| Replicate | `REPLICATE_API_TOKEN` | Run any HF Whisper checkpoint — see Egyptian models below |

### Recommended models for Egyptian Arabic

Via Replicate (custom Cog wrappers) or HuggingFace:

- `MAdel121/whisper-medium-egy` — fine-tuned on 72h Egyptian dataset
- `AbdelrahmanHassan/whisper-large-v3-egyptian-arabic` — best quality
- `IbrahimAmin/code-switched-egyptian-arabic-whisper-small` — for AR/EN code-switching

Or via Deepgram: pick `nova-3` model and language `ar`.

## Privacy & data

- Audio you upload **goes to whichever provider you choose**. Choose providers carefully if your audio is sensitive.
- The Local provider never sends data anywhere — everything stays on your machine.
- We store transcription results in a local SQLite DB at `data/jobs.db` for caching. Delete the file to wipe history.
- We do not collect telemetry, analytics, or usage data of any kind.

## Security

- Localhost-only by default. Set `ALLOW_LAN=true` if you need LAN access — but be aware anyone on your network can then submit jobs and burn your provider credits.
- All file paths are server-generated UUIDs, validated against a strict regex before any disk access.
- Uploaded files are sniffed by magic bytes — `.exe` renamed to `.mp4` is rejected.
- See [SECURITY.md](./SECURITY.md) for vulnerability disclosure.

## Architecture

```
upload → /api/upload (UUID, magic-byte sniff, FFmpeg extract to FLAC)
  ↓
SQLite jobs queue ← /api/transcribe (validates, enqueues)
  ↓
worker.ts loop:
  → check cache → if hit, done
  → call provider.start()
  → if pending, schedule poll
  → if failed + retryable + fallback chain, advance to next provider
  → on done, cache + persist
  ↓
UI polls /api/jobs/[id] every 2s
  ↓
SubtitleEditor + ExportPanel (SRT / VTT / burn-in MP4)
```

See [docs/architecture.md](./docs/architecture.md) for the full design.

## Contributing

Issues and PRs welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md).

Adding a new provider is one file in `src/lib/providers/` plus one entry in `registry.ts` — most providers fit in <100 lines.

## License

MIT — see [LICENSE](./LICENSE).

## Credits

- Reference UI patterns from [Nutlope/ai-subtitles](https://github.com/Nutlope/ai-subtitles)
- Local provider patterns from [albertshiney/typr](https://github.com/albertshiney/typr)
- Provider abstraction inspired by sibling project `wsool-stt`
- Built by [wsool.ai](https://wsool.ai)

---

## wsool-subtitles — بالعربية

<div dir="rtl" align="right">

أداة موحّدة لتفريغ الفيديو إلى نصوص (Subtitles) عبر **14 مزوّد STT** مختلف وأكثر من **30 موديل**، مع دعم كامل **للهجة المصرية** ومود **محلي بالكامل** يعمل بدون أي مفاتيح API.

تشتغل على جهازك مباشرة — مفيش SaaS، مفيش تتبع، مفيش حسابات. كلون → شغّل → فرّغ.

### المميزات

- ارفع فيديو → احصل على ملف SRT/VTT قابل للتعديل + MP4 بالترجمة محروقة عليه
- اختر أي مزوّد: Local whisper.cpp · Groq · OpenAI · Together · Fireworks · Fal · HuggingFace · Gemini · ElevenLabs · AssemblyAI · Speechmatics · Soniox · Deepgram · Replicate
- عامل تشغيل (worker) غير متزامن يتعامل مع المزودين البطيئين (Replicate و AssemblyAI و Speechmatics) بدون مشاكل
- كاش بمفتاح sha256: لو شغّلت نفس الصوت على نفس المزوّد تاني → نتيجة فورية ومجانية
- عرض الكلمات منخفضة الثقة بألوان (أصفر/أحمر) في المحرّر
- زر ترجمة لأي لغة → إنجليزي مجانًا (لمزودات Whisper)
- صفحة سجل (`/history`) لكل التفريغات السابقة مع تنزيل SRT/VTT مباشر
- خطوط Cairo و Tajawal و IBM Plex Sans Arabic مدمجة لظهور الحروف العربية بشكل صحيح عند الحرق
- محصور على localhost افتراضيًا — مفاتيحك مش هتتعرّض للشبكة المحلية بالغلط

### تشغيل سريع

<div dir="ltr">

```bash
git clone https://github.com/wsool-ai/wsool-subtitles.git
cd wsool-subtitles
npm install
cp .env.example .env
chmod 600 .env

npm run fonts:download
npm run smoke:libass

npm run dev
# افتح http://localhost:3000
```

</div>

### تشغيل بدون أي مفاتيح API

اختر مزوّد **Local (whisper.cpp)** من الواجهة. هينزل الموديل أول مرة من HuggingFace (75MB إلى 3GB حسب الحجم). لازم يكون `whisper-cli` متثبّت ومضاف للـ PATH:

<div dir="ltr">

```bash
# macOS
brew install whisper-cpp
# Linux/Windows: راجع https://github.com/ggerganov/whisper.cpp
```

</div>

### الموديلات المنصوحة للعامية المصرية

عبر Replicate (Cog wrappers) أو HuggingFace مباشرة:

- `MAdel121/whisper-medium-egy` — مدرّب على 72 ساعة من العامية المصرية
- `AbdelrahmanHassan/whisper-large-v3-egyptian-arabic` — أفضل جودة
- `IbrahimAmin/code-switched-egyptian-arabic-whisper-small` — للمزج بين العربي والإنجليزي
- `tarteel-ai/whisper-base-ar-quran` — للقرآن الكريم

أو عبر Deepgram: اختار موديل `nova-3` ولغة `ar`.

أو عبر Soniox: أحسن WER للعربي (16.2%) ويشمل العامية المصرية.

### الخصوصية

- الصوت اللي بترفعه **بيتبعت للمزوّد اللي اخترته**. اختار بحرص لو الصوت حساس.
- مزوّد Local مش بيبعت أي بيانات لأي حد — كل شيء يفضل على جهازك.
- النتائج بتتخزن في SQLite محلي في `data/jobs.db` للكاش. احذف الملف عشان تمسح السجل.
- مفيش تتبع، مفيش analytics، مفيش جمع بيانات.

### الأمان

- محصور على localhost. لو محتاج تسمح بالشبكة المحلية: `ALLOW_LAN=true` (لكن أي حد على شبكتك يقدر يصرف من رصيدك).
- كل المسارات على القرص بـ UUID مولّدة من السيرفر، متحقّق منها بـ regex قبل أي قراءة/كتابة.
- الملفات المرفوعة بتتفحص بالـ magic bytes — `.exe` متنكّر كـ `.mp4` بيترفض.

### رخصة

MIT — راجع [LICENSE](./LICENSE).

</div>
