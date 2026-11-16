alter table public.beta_allowlist drop constraint beta_allowlist_email_check;
alter table public.beta_allowlist add constraint beta_allowlist_email_check check (email ~ '^\S+@\S+\.\S+$');
create or replace function public.beta_allowlist_normalize()
returns trigger language plpgsql set search_path = '' as $$
begin new.email := lower(trim(new.email)); return new; end; $$;
create trigger beta_allowlist_normalize before insert or update on public.beta_allowlist
  for each row execute function public.beta_allowlist_normalize();
