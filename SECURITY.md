# Security Policy

Ponder+ is an 18+ live-social platform. Security, privacy, moderation controls, and economy integrity are product requirements.

## Please report privately

Do not open a public issue for:
- authentication or authorization bypasses
- row-level security failures
- age-gate or account-control bypasses
- access to another user's private data
- wallet, gift, purchase, or payout manipulation
- exposed credentials or secrets
- moderation/admin privilege escalation
- media-room token or role escalation

Use GitHub's private vulnerability reporting feature when enabled for this repository, or contact the repository owner privately.

## Engineering expectations

- Secrets never enter source control.
- Client applications never receive service-role credentials.
- Sensitive writes are server-controlled and least-privilege.
- Economy operations are idempotent and auditable.
- High/critical dependency advisories fail CI.
- Security-sensitive changes require tests and review.
