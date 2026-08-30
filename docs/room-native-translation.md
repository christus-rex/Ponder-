# Room-native translation

Ponder+ treats translation as a listener-side capability attached to an individual participant audio track.

## Why track-level translation

Cloudflare RealtimeKit exposes a remote participant's MediaStreamTrack in the `audioUpdate` event. That lets Ponder+ keep the original room mix untouched and selectively attach a translation sidecar to a speaker only when a listener requests it.

```text
RealtimeKit participant.audioTrack
        |
        +----> normal room playback
        |
        +----> Ponder translation sidecar (optional)
                    |
                    +----> translated audio
                    +----> source captions
                    +----> translated captions
```

## Current implementation

- `lib/realtime/realtimekitTrackBridge.ts`
  - translates RealtimeKit `audioUpdate` events into a provider-neutral audio-track callback.
- `lib/translation/openaiRealtimeClient.ts`
  - takes one `MediaStreamTrack`, requests a short-lived translation credential, and creates the WebRTC translation sidecar.
- `app/api/translation/session/route.ts`
  - authenticated server route that keeps `OPENAI_API_KEY` off the client.
- `app/rooms/lab/page.tsx`
  - authenticated room lab.
- `components/LiveTranslationLab.tsx`
  - uses the local microphone as a stand-in participant track until RealtimeKit room tokens are configured.

## Next integration step

1. Add the Cloudflare RealtimeKit React SDK.
2. Mint participant auth tokens on the Ponder+ backend.
3. Initialize a RealtimeKit meeting for a database room.
4. Feed remote participant `audioTrack` updates through `subscribeToRealtimeKitAudioTracks`.
5. Expose a Translate control on each participant tile.
6. Cap concurrent translation sidecars by user/room and stop them aggressively on inactivity.

## Cost posture

The dedicated realtime translation model is billed by audio duration. Ponder+ should never translate every speaker for every listener by default. Start only on explicit listener action and reuse server-side source-speaker/target-language translation when room scale justifies it.
