begin;

-- These schemas are intentionally retained as future product foundations, but
-- no current user-facing workflow owns their browser write/read contracts.
-- Keep them server-only until a reviewed messaging/economy implementation
-- reintroduces narrowly scoped access.

revoke all on table public.messages from anon, authenticated;
drop policy if exists "room members read messages" on public.messages;
drop policy if exists "room members send messages" on public.messages;
drop policy if exists "authors edit messages" on public.messages;
grant select, insert, update, delete on table public.messages to service_role;

revoke all on table public.wallet_links from anon, authenticated;
drop policy if exists "users manage own wallet links" on public.wallet_links;
drop policy if exists "users add own wallet links" on public.wallet_links;
drop policy if exists "users remove own wallet links" on public.wallet_links;
grant select, insert, update, delete on table public.wallet_links to service_role;

revoke all on table public.ledger_accounts from anon, authenticated;
revoke all on table public.ledger_entries from anon, authenticated;
revoke all on table public.ledger_postings from anon, authenticated;

drop policy if exists "users read own ledger accounts" on public.ledger_accounts;
drop policy if exists "users read entries touching own accounts" on public.ledger_entries;
drop policy if exists "users read own postings" on public.ledger_postings;

grant select, insert, update, delete on table public.ledger_accounts to service_role;
grant select, insert, update, delete on table public.ledger_entries to service_role;
grant select, insert, update, delete on table public.ledger_postings to service_role;

comment on table public.messages is
  'Dormant messaging foundation. Browser access is disabled until the moderated messaging product is implemented.';
comment on table public.wallet_links is
  'Dormant wallet-link foundation. Browser access is disabled until server-verified wallet linking is implemented.';
comment on table public.ledger_accounts is
  'Server-owned accounting foundation. No browser access; expose only through reviewed financial APIs.';
comment on table public.ledger_entries is
  'Server-owned accounting journal. No browser access; mutations remain service operations.';
comment on table public.ledger_postings is
  'Server-owned double-entry postings. No browser access; mutations remain service operations.';

commit;
