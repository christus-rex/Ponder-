# Ponder+ Product Architecture v1

## Product thesis

Ponder+ is **live social with intent**.

The product should optimize for the probability that two adults genuinely want to continue a conversation, not for watch time, popularity, or spend. Livestreaming, chat, translation, creator monetization, private rooms, and virtual goods are supporting primitives around that goal.

This architecture is informed by clean-room observation of mature live-social products. It does not copy proprietary code, assets, or private implementation details.

## Core experience loop

1. **Declare intent** — talk, meet, deep conversation, create, debate, listen, or hang out.
2. **Discover by resonance** — rank people and rooms by intent compatibility and shared interests.
3. **Enter a small room** — low-friction audio/video/text with explicit room purpose.
4. **Build trust progressively** — public room -> follow/connect -> DM -> invited/private interaction.
5. **Use assistance invisibly** — translation, moderation, anti-spam, and conversation prompts remain sidecars.
6. **Create continuity** — follow, circle/community, scheduled return, subscription, or saved moment.
7. **Monetize transparently** — gifts and subscriptions support relationships; they do not buy ranking priority.

## Product boundaries

- 18+ only.
- Mature-audience social product, not an explicit-content marketplace.
- Consent and safety controls are MVP functionality.
- Real-money operations remain server authoritative.
- Recommendation ranking must never use gift/spend amount as a social-worth signal.
- Sensitive age/account-control data remains separate from public profile data.

## System layers

### Client plane

- Next.js web/PWA
- Expo/React Native mobile
- Auth/onboarding
- Discovery
- Room UI
- Translation controls
- Wallet/subscription UI
- Safety/reporting UX

### Control plane

- Supabase Auth
- Postgres + RLS
- Central authorization
- Ponder Room Brain
- Presence
- connection/consent state
- moderation state
- wallet ledger
- notifications
- recommendation inputs and outcomes

### Media plane

A provider abstraction owns:

- publish/subscribe
- audio/video tracks
- SFU provider integration
- room media tokens
- recording only where policy and consent allow it

The application control plane must not depend on a specific media provider.

### AI sidecars

AI services are non-authoritative helpers:

- live translation
- captions
- spam/toxicity signals
- moderation triage
- room prompts
- optional summaries/highlights with participant consent
- future semantic-interest embeddings

AI must not grant permissions, move money, or silently override account enforcement.

## Domain additions

### Social intent

Current canonical intents:

- talk
- meet
- deep_conversation
- create
- debate
- listen
- hang_out

Intent is session-like and may change frequently. It should be treated as a high-value discovery signal.

### Resonance candidate

A discovery candidate contains only ranking-relevant public/safety-cleared data:

- user id
- current intent
- interests
- eligibility
- block relationship

Future inputs may include:

- languages
- room/topic affinity
- recent positive interaction history
- explicit negative feedback
- availability/presence
- semantic interest embeddings

Do **not** add spending, gift totals, follower count, or creator revenue to the default person-to-person resonance score.

### Resonance outcome

Store enough data later to evaluate ranking quality without storing private conversation content:

- viewer
- candidate
- reason shown
- rank position
- room entered?
- meaningful interaction?
- connected/followed?
- blocked/reported?
- returned to interact again?

The long-term optimization target is **continued mutually positive interaction**, not raw session duration.

## Resonance v1

The first implementation is intentionally deterministic and auditable.

Weights:

- 65% declared-intent affinity
- 35% normalized interest overlap

Properties:

- exact and complementary intents rank strongly
- shared interests refine ordering
- blocked/ineligible candidates are removed
- score is deterministic
- no popularity or monetization inputs

This becomes the benchmark against which future embedding/ML rankers must prove improvement.

## Consent ladder

Recommended progression:

1. public profile visibility
2. public room interaction
3. follow/connect request
4. accepted connection
5. direct message
6. voice/video invite
7. private room
8. media/file sharing where allowed

Every escalation is explicit. A user may block or revoke future interaction at any point.

## Economy

Keep the existing append-only/double-entry direction.

Recommended money flow:

purchase -> platform liability -> gift/subscription event -> creator payable -> payout

Requirements:

- idempotency key on every money-like action
- server-side price and entitlement verification
- client never writes balances
- transparent user receipts
- transparent creator payout states
- compensating entries instead of mutation/deletion
- fraud/risk holds carry machine-readable reason codes internally

Virtual gifts should create social experiences without becoming ranking votes.

## Moderation

The moderation pipeline should combine:

1. client controls: mute, block, report, leave
2. room controls: host/moderator remove, mute, terminate
3. automated signals: spam, unsafe imagery/audio/text, fraud
4. human review for material enforcement
5. account enforcement in central authz
6. appeal/audit trail

Priority reports:

- underage concern
- threats/violence
- non-consensual sexual content
- harassment/stalking
- hate
- impersonation
- fraud/scam

## Translation

Translation remains a room sidecar rather than a primary navigation destination.

Principles:

- original audio is preserved
- translated captions/audio are opt-in
- participant language preference is explicit
- translation failure never breaks the room
- translation does not alter moderation evidence

## Room Brain responsibilities

Room Brain is authoritative for ephemeral room coordination:

- join/leave
- participant roles
- speaker queue
- moderation commands
- reactions
- room termination
- retry/idempotency semantics
- transport acknowledgements and resync

It should not own:

- durable profile storage
- settlement
- KYC
- long-term recommendation model state

## Navigation state

Unauthenticated:

landing -> auth -> age gate/terms -> onboarding -> discover

Authenticated:

discover
  -> person/profile
  -> room
  -> connections/messages
  -> creator circle
  -> account/menu

Room:

preview -> join -> active -> leave
                    -> connect
                    -> report/block
                    -> gift
                    -> translate
                    -> invite/escalate where permitted

## Build order

### Phase A — differentiated discovery

- [x] current intent persisted
- [x] interests persisted
- [x] discovery surface
- [x] deterministic resonance scorer
- [x] rank discovery candidates with scorer
- [x] log privacy-safe discovery outcomes
- [ ] add presence/availability signal

### Phase B — relationship continuity

- [x] connection table foundation
- [ ] connection request/accept UI
- [ ] block semantics separated from normal connection status
- [ ] direct-message conversation model
- [ ] notification pipeline
- [ ] creator circles

### Phase C — live room product

- [x] Room Brain domain/state machine
- [x] worker direction
- [x] translation sidecar prototype
- [ ] production media-provider adapter
- [ ] room creation/join flow
- [ ] moderator UI
- [ ] media-token service
- [ ] real presence

### Phase D — economy

- [x] append-only/double-entry foundations
- [ ] server gift transaction endpoint
- [ ] catalog/entitlements
- [ ] subscriptions
- [ ] creator payable states
- [ ] payout integration
- [ ] transparent receipts/limits

### Phase E — learned resonance

Only after sufficient outcome data:

- semantic interest embeddings
- exploration/exploitation strategy
- per-intent ranking evaluation
- fairness/safety audits
- A/B evaluation against deterministic v1

The deterministic ranker remains available as a fallback and audit baseline.

## Success metrics

Primary:

- meaningful conversations per active user
- accepted connection rate after room interaction
- 7-day repeat interaction with the same person/community
- positive room exit feedback
- creator earnings distributed across healthy communities

Guardrails:

- block/report rate
- underage-risk reports
- moderation response time
- payout disputes
- concentration of discovery impressions
- spend concentration
- crash/reconnect rate
- translation failure rate

## Next implementation target

Add presence/availability as a **bounded ranking signal** without allowing it to overwhelm intent and interest compatibility. Presence should answer "who can genuinely talk now?" while keeping the deterministic Resonance v1 score auditable.

After that, wire outcome events into real profile, room, connection, block, and report transitions so telemetry reflects verified product actions rather than only impression exposure.
