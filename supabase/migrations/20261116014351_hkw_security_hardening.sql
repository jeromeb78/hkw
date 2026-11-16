-- Security hardening: least-privilege grants, faster MFA policies, size limits,
-- rate limits on public forms and invite codes, safer sign-up parsing, self-service account deletion.

-- 1. Least privilege. Supabase grants ALL (incl. TRUNCATE, which ignores RLS) to anon/authenticated by default.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;

-- Public forms: insert only, only the form's own columns (no ids, timestamps or sync flags)
grant insert (first_name, last_name, email, phone, country, invite_code, plan, email_consent, sms_consent, disclaimer_ack, source)
  on public.beta_signups to anon, authenticated;
grant insert (name, email, topic, message) on public.contact_messages to anon, authenticated;
-- Member data (RLS still limits every row to its owner, with two-step verification)
grant select on public.profiles to authenticated;
grant update (first_name, last_name, phone, country, tier, archetype, risk_band, season,
              email_consent, email_consent_at, sms_consent, sms_consent_at,
              discreet_notifications, messages_paused) on public.profiles to authenticated;
grant select, insert (user_id, lesson_key, quiz_score) on public.lesson_progress to authenticated;
grant update (quiz_score) on public.lesson_progress to authenticated;
grant select, insert (user_id, state) on public.member_state to authenticated;
grant update (user_id, state) on public.member_state to authenticated;
grant select on public.redemptions to authenticated;
-- app_settings, beta_allowlist, promo_codes: no access for anon/authenticated (dashboard and service role only)

-- Trigger/helper functions are not API endpoints
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.beta_allowlist_normalize() from public, anon, authenticated;
revoke execute on function public.normalize_code(text) from public, anon, authenticated;

-- 2. Evaluate auth.jwt() once per query, not per row
drop policy "require mfa" on public.profiles;
drop policy "require mfa" on public.lesson_progress;
drop policy "require mfa" on public.member_state;
drop policy "own redemptions read" on public.redemptions;
create policy "require mfa" on public.profiles as restrictive for all to authenticated
  using (((select auth.jwt()) ->> 'aal') = 'aal2') with check (((select auth.jwt()) ->> 'aal') = 'aal2');
create policy "require mfa" on public.lesson_progress as restrictive for all to authenticated
  using (((select auth.jwt()) ->> 'aal') = 'aal2') with check (((select auth.jwt()) ->> 'aal') = 'aal2');
create policy "require mfa" on public.member_state as restrictive for all to authenticated
  using (((select auth.jwt()) ->> 'aal') = 'aal2') with check (((select auth.jwt()) ->> 'aal') = 'aal2');
create policy "own redemptions read" on public.redemptions for select to authenticated
  using ((select auth.uid()) = user_id and ((select auth.jwt()) ->> 'aal') = 'aal2');

-- 3. Size limits on member-editable data
alter table public.profiles
  add constraint profiles_lengths check (
    coalesce(char_length(first_name), 0) <= 100 and coalesce(char_length(last_name), 0) <= 100 and
    coalesce(char_length(phone), 0) <= 30 and coalesce(char_length(country), 0) <= 80 and
    coalesce(char_length(archetype), 0) <= 80 and coalesce(char_length(risk_band), 0) <= 40 and
    coalesce(char_length(season), 0) <= 40);
alter table public.member_state
  add constraint member_state_size check (jsonb_typeof(state) = 'object' and octet_length(state::text) <= 200000);

-- 4. Rate limits on the public forms (no read access, so counted by a definer function)
create or replace function public.limit_public_submissions()
returns trigger language plpgsql security definer set search_path = '' as $$
declare same_email int; recent int;
begin
  if tg_table_name = 'beta_signups' then
    select count(*) filter (where lower(email) = lower(new.email) and created_at > now() - interval '1 hour'),
           count(*) filter (where created_at > now() - interval '10 minutes')
      into same_email, recent from public.beta_signups where created_at > now() - interval '1 hour';
    if same_email >= 3 then raise exception 'HKW_RATE_LIMIT: too many sign-ups for this email' using errcode = 'P0001'; end if;
  else
    select count(*) filter (where lower(email) = lower(new.email) and created_at > now() - interval '1 hour'),
           count(*) filter (where created_at > now() - interval '10 minutes')
      into same_email, recent from public.contact_messages where created_at > now() - interval '1 hour';
    if same_email >= 5 then raise exception 'HKW_RATE_LIMIT: too many messages from this email' using errcode = 'P0001'; end if;
  end if;
  if recent >= 100 then raise exception 'HKW_RATE_LIMIT: too many submissions, try again shortly' using errcode = 'P0001'; end if;
  return new;
end; $$;
revoke execute on function public.limit_public_submissions() from public, anon, authenticated;
create trigger beta_signups_rate_limit before insert on public.beta_signups
  for each row execute function public.limit_public_submissions();
create trigger contact_messages_rate_limit before insert on public.contact_messages
  for each row execute function public.limit_public_submissions();
create index contact_messages_created_idx on public.contact_messages (created_at);
create index beta_signups_created_idx on public.beta_signups (created_at);

-- 5. Invite-code guessing limit: 10 attempts per member per hour
create table public.promo_attempts (
  user_id uuid not null references auth.users(id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index promo_attempts_user_idx on public.promo_attempts (user_id, attempted_at);
alter table public.promo_attempts enable row level security;

create or replace function public.redeem_invite(p_code text)
returns json language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); ok boolean;
begin
  if uid is null or coalesce(auth.jwt()->>'aal', '') <> 'aal2' then
    raise exception 'Sign in with two-step verification first' using errcode = '42501';
  end if;
  if (select count(*) from public.promo_attempts where user_id = uid and attempted_at > now() - interval '1 hour') >= 10 then
    raise exception 'HKW_RATE_LIMIT: too many code attempts, try again later' using errcode = 'P0001';
  end if;
  insert into public.promo_attempts (user_id) values (uid);
  ok := public.apply_promo(uid, left(p_code, 60));
  return (select json_build_object('ok', ok, 'plan', plan, 'plan_expires_at', plan_expires_at)
            from public.profiles where id = uid);
end; $$;
revoke execute on function public.redeem_invite(text) from public, anon;
grant execute on function public.redeem_invite(text) to authenticated;

-- 6. Sign-up metadata comes from the browser: never let a malformed value break or skew the profile
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
        ec boolean := coalesce(m->>'email_consent', '') = 'true';
        sc boolean := coalesce(m->>'sms_consent', '') = 'true';
begin
  insert into public.profiles (id, email, first_name, last_name, phone, country,
                               email_consent, email_consent_at, sms_consent, sms_consent_at, source)
  values (new.id, new.email,
          nullif(left(trim(m->>'first_name'), 100), ''), nullif(left(trim(m->>'last_name'), 100), ''),
          nullif(left(trim(m->>'phone'), 30), ''),
          coalesce(nullif(left(trim(m->>'country'), 80), ''), 'United States'),
          ec, case when ec then now() end, sc, case when sc then now() end, 'app');
  if coalesce(m->>'invite_code', '') <> '' then
    perform public.apply_promo(new.id, left(m->>'invite_code', 60));
  end if;
  return new;
end; $$;

-- 7. Members can delete their own account and data (privacy right)
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); em text;
begin
  if uid is null or coalesce(auth.jwt()->>'aal', '') <> 'aal2' then
    raise exception 'Sign in with two-step verification first' using errcode = '42501';
  end if;
  select email into em from auth.users where id = uid;
  delete from public.beta_signups where lower(email) = lower(em);
  delete from public.contact_messages where lower(email) = lower(em);
  delete from auth.users where id = uid;  -- cascades to profiles, lesson_progress, member_state, redemptions, MFA factors
end; $$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
