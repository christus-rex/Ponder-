begin;

create schema if not exists extensions;
alter extension citext set schema extensions;

-- This function is intended only for the auth.users trigger. It must not be
-- callable through PostgREST RPC by anonymous or authenticated clients.
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;

-- Age verification is server-owned. Users may acknowledge Terms, but may not
-- self-promote age_status or age_verified_at after signup.
revoke update on public.user_private from authenticated;
grant update (terms_accepted_at) on public.user_private to authenticated;

drop policy if exists "users update own private record" on public.user_private;
create policy "users update own terms acceptance"
on public.user_private for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

-- Cover foreign-key access paths identified by the Supabase performance advisor.
create index if not exists connections_addressee_idx
  on public.connections(addressee_id);

create index if not exists ledger_postings_account_idx
  on public.ledger_postings(account_id);

create index if not exists messages_sender_idx
  on public.messages(sender_id);

create index if not exists rooms_created_by_idx
  on public.rooms(created_by);

commit;
