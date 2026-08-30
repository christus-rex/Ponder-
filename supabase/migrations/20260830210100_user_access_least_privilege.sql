begin;

revoke all on table public.user_access from anon;
revoke all on table public.user_access from authenticated;
grant select on table public.user_access to authenticated;

commit;
