# Trust, Safety, Privacy & Compliance Baseline

Ponder+ is an adults-only platform. Safety capabilities ship in the first usable build.

This is an engineering baseline, not legal advice. Jurisdiction-specific requirements require qualified counsel and approved vendors.

## Age and identity

Explicitly prohibit minors. Enforce age/identity state server-side. Treat viewer age assurance and creator KYC as separate capabilities. Put verification providers behind an adapter. Prefer storing verification status plus provider reference instead of identity-document copies. Support jurisdiction-aware access policy and reverification.

## Creator onboarding

Before monetization or mature-content broadcasting: verify identity/age, capture required attestations, establish payout identity, accept creator terms, establish consent/content responsibilities, and create an auditable verification state.

## UGC safety

Required product capabilities: report content, report user, block, mute where useful, moderation queue, moderator actions/notes, appeals, emergency room termination, and repeat-offender controls.

Report and block must be easy to find in the interaction surface.

## Zero-tolerance categories

Design explicit handling for minors/sexual content involving minors, non-consensual intimate content, exploitation/trafficking, coercion, content without required rights/consent, and illegal content.

Build preservation, escalation, removal, and external-reporting workflows where applicable law requires them.

## Moderation architecture

Use preventive product rules, input/upload validation, automated risk signals, human review for ambiguous/high-impact cases, appeals, and immutable audit trails.

AI may assist moderation but should not be the sole final decision-maker for serious sanctions without a defined review policy.

## Privacy

Collect the minimum data required. Classify public profile, private account, highly sensitive verification/KYC, financial, private communications, and moderation/audit data. Define retention/deletion policy for each class before launch.

Verification images and government IDs should normally remain with the specialist verification provider rather than Ponder+'s core database.

## Payments

Do not integrate a processor until the intended business model is explicitly approved.

Support processor abstraction, idempotent checkout, signed webhooks, immutable ledger entries, refunds, disputes/chargebacks, reserves/holds, creator revenue share, payout reconciliation, and fraud/risk states. Never store raw card numbers.

## Abuse/fraud controls

Cover account/payment/tip velocity, stolen-card patterns, account takeover, creator collusion, self-tipping/laundering patterns, refund abuse, bots, spam, and malicious report abuse. Log risk decisions with reason codes.

## Admin controls

Admin tooling must support account lookup, verification state, report history, moderation timeline, financial timeline, room termination, takedown, account suspension, payout hold, and audit logs.
