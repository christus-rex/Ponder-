# Live AI Translator

## Product behavior

Ponder+ Live AI Translator gives a listener translated speech and captions while another participant is speaking. The first implementation uses OpenAI's dedicated realtime translation model and keeps the provider boundary small enough to replace later.

### MVP

- microphone capture
- automatic source-language handling by the model
- selectable target language
- source transcript
- translated transcript
- translated audio
- server-minted ephemeral client secret
- no long-lived OpenAI key in the browser

## Architecture

```text
speaker microphone
    |
    v
WebRTC source audio
    |
    v
OpenAI Realtime Translation
(gpt-realtime-translate)
    |                    |
    v                    v
source/target captions   translated audio
```

For a Ponder+ room, keep every participant audio track separate. Create translation sidecars only for active speaker + requested listener-language pairs.

For a large room, move translation from listener devices to a server media worker:

```text
room participant track
    -> media worker
    -> translation session per target language
    -> republished translated audio/caption track
    -> all listeners using that language
```

This avoids creating one AI session per listener.

## Local demo

Requires Node.js 20+ and an OpenAI API key.

```bash
export OPENAI_API_KEY="..."
npm run translator:demo
```

Open http://localhost:8787 and allow microphone access.

## Production integration

1. Replace the demo IP-derived safety identifier with a hash of the authenticated Ponder+ user ID.
2. Move client-secret minting to the Ponder+ backend/Supabase Edge Functions.
3. Connect the translator input to the individual remote participant audio track from the realtime media provider.
4. Persist only user-approved transcript history; translation should be ephemeral by default.
5. Add room-level limits: enabled languages, max simultaneous translation sidecars, idle timeout, and spend caps.
6. Add reconnect and degraded-mode behavior (captions-only when translated audio is unavailable).
7. Add bilingual golden-set QA for names, dates, numbers, accents, slang, code-switching, and mature-room vocabulary.

## Cost-control strategy

- Do not start translation sessions until a listener turns translation on.
- Reuse one server-side session per active source speaker + target language for larger rooms.
- Stop translation sidecars promptly when a speaker becomes inactive or the listener leaves.
- Offer captions-only mode as the low-bandwidth fallback.
