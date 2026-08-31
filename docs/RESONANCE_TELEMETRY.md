# Resonance Telemetry v1

Resonance telemetry exists to answer one product question:

> Does an explainable recommendation lead to a mutually positive continuation of interaction?

It is deliberately not a conversation-surveillance system.

## Stored data

For each discovery impression:

- authenticated viewer id
- candidate id
- rank position (1–12)
- Resonance v1 score (0–100)
- coarse reason code
- algorithm version
- discovery surface
- timestamp

For an outcome:

- impression id
- authenticated viewer id
- coarse outcome enum
- optional room id
- timestamp

## Explicitly not stored

- message bodies
- voice/audio
- video
- captions or translations
- bios
- raw interest arrays
- search text
- free-form recommendation explanations
- gift/spend amounts
- precise location
- device fingerprinting

## Reason codes

- `same_intent`
- `complementary_intent`
- `shared_interests`
- `compatible_intent`

Only one primary reason code is persisted per impression. Human-readable explanation text remains presentation-only.

## Outcome kinds

- `profile_opened`
- `room_entered`
- `connection_requested`
- `connection_accepted`
- `blocked`
- `reported`
- `repeat_interaction`

These are structured product events, not qualitative conversation judgments.

## Security model

The telemetry tables have RLS enabled and no direct `anon` or `authenticated` table privileges.

Writes go through two narrow RPCs:

- `record_resonance_impression_batch`
- `record_resonance_outcome`

The database derives `viewer_id` from `auth.uid()`. Callers cannot submit another viewer id.

Impression batches are capped at 12 candidates, duplicate candidates are rejected, scores are bounded, reason codes are allow-listed, candidates must be active/onboarded, and rapid duplicate batches are collapsed for five seconds.

Outcome writes require ownership of the referenced impression and are idempotent per impression/outcome/room tuple.

## Data-quality caveat

These RPCs provide strong identity, shape, and eligibility validation, but the public client can still invoke them. Treat telemetry as **product analytics**, not as an unquestionable financial/security audit log.

Before using telemetry to train a learned ranker, add abuse filtering, minimum-sample thresholds, and offline consistency checks against server-side product events.

## Evaluation direction

Use aggregated outcomes to compare:

- impression → profile open
- impression → room entry
- impression → connection request
- impression → accepted connection
- 7-day repeat interaction
- block/report guardrails

The optimization target remains continued mutually positive interaction, not watch time or spend.
