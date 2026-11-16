-- Sign-in support: beta allow-list, invite codes, MFA-only access to member data.

-- App settings (single row; dashboard/service role only)
create table public.app_settings (
  id boolean primary key default true check (id),
  beta_gate boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.app_settings (id) values (true);
alter table public.app_settings enable row level security;

-- Emails allowed to create accounts while beta_gate is on (tagged beta-tester in GoHighLevel)
create table public.beta_allowlist (
  email text primary key check (email = lower(email) and email ~ '^\S+@\S+\.\S+$'),
  note text,
  added_at timestamptz not null default now()
);
alter table public.beta_allowlist enable row level security;

-- Invitation / promo codes (docs/MEMBERSHIP-PRICING-PROMO.md)
create table public.promo_codes (
  code text primary key check (code = upper(code)),
  plan text not null default 'sisters_keeper' check (plan in ('premium','sisters_keeper','circle','vip')),
  months int check (months > 0),               -- null = lifetime
  starts_at timestamptz,
  expires_at timestamptz,
  max_redemptions int,
  redemption_count int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.redemptions (
  code text not null references public.promo_codes(code),
  user_id uuid not null references auth.users(id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  primary key (code, user_id)
);
create index redemptions_user_idx on public.redemptions(user_id);
alter table public.promo_codes enable row level security;
alter table public.redemptions enable row level security;
create policy "own redemptions read" on public.redemptions for select to authenticated
  using ((select auth.uid()) = user_id and (select auth.jwt()->>'aal') = 'aal2');

insert into public.promo_codes (code, plan, months) values ('MYSISTERSKEEPER', 'sisters_keeper', 12);

alter table public.profiles add column plan_expires_at timestamptz;
revoke update (plan_expires_at) on public.profiles from authenticated;

-- Normalizes a code the same way the app does (case, spaces, apostrophes)
create or replace function public.normalize_code(c text)
returns text language sql immutable set search_path = '' as $$
  select upper(regexp_replace(coalesce(c, ''), '[[:space:]''’]', '', 'g'));
$$;

-- Internal: apply a code to a user. Returns true when applied.
create or replace function public.apply_promo(p_user uuid, p_code text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare pc public.promo_codes; n int;
begin
  select * into pc from public.promo_codes
   where code = public.normalize_code(p_code) and active
     and (starts_at is null or starts_at <= now())
     and (expires_at is null or expires_at > now())
     and (max_redemptions is null or redemption_count < max_redemptions)
   for update;
  if not found then return false; end if;
  insert into public.redemptions (code, user_id) values (pc.code, p_user) on conflict do nothing;
  get diagnostics n = row_count;
  if n = 0 then return true; end if;  -- already redeemed by this user
  update public.promo_codes set redemption_count = redemption_count + 1 where code = pc.code;
  update public.profiles
     set plan = pc.plan,
         plan_expires_at = case when pc.months is null then null else now() + make_interval(months => pc.months) end,
         source = coalesce(source, 'promo')
   where id = p_user;
  return true;
end; $$;
revoke execute on function public.apply_promo(uuid, text) from public, anon, authenticated;

-- Member-callable: redeem a code from inside the app (requires two-step verification)
create or replace function public.redeem_invite(p_code text)
returns json language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); ok boolean;
begin
  if uid is null or coalesce(auth.jwt()->>'aal', '') <> 'aal2' then
    raise exception 'Sign in with two-step verification first' using errcode = '42501';
  end if;
  ok := public.apply_promo(uid, p_code);
  return (select json_build_object('ok', ok, 'plan', plan, 'plan_expires_at', plan_expires_at)
            from public.profiles where id = uid);
end; $$;
revoke execute on function public.redeem_invite(text) from public, anon;
grant execute on function public.redeem_invite(text) to authenticated;

-- Beta gate: block account creation for emails not on the allow-list
create or replace function public.enforce_beta_gate()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select beta_gate from public.app_settings where id) and new.email is not null
     and not exists (select 1 from public.beta_allowlist where email = lower(new.email)) then
    raise exception 'HKW_NOT_INVITED: % is not on the beta list', new.email using errcode = 'P0001';
  end if;
  return new;
end; $$;
revoke execute on function public.enforce_beta_gate() from public, anon, authenticated;
create trigger hkw_beta_gate before insert on auth.users
  for each row execute function public.enforce_beta_gate();

-- Profile from sign-up metadata (name, phone, country, consents, invite code)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, email, first_name, last_name, phone, country,
                               email_consent, email_consent_at, sms_consent, sms_consent_at, source)
  values (new.id, new.email,
          left(m->>'first_name', 100), left(m->>'last_name', 100), left(m->>'phone', 30),
          coalesce(left(m->>'country', 80), 'United States'),
          coalesce((m->>'email_consent')::boolean, false),
          case when (m->>'email_consent')::boolean then now() end,
          coalesce((m->>'sms_consent')::boolean, false),
          case when (m->>'sms_consent')::boolean then now() end,
          'app');
  if coalesce(m->>'invite_code', '') <> '' then
    perform public.apply_promo(new.id, m->>'invite_code');
  end if;
  return new;
end; $$;

-- Member data requires two-step verification (aal2), on top of the owner-only policies
create policy "require mfa" on public.profiles as restrictive for all to authenticated
  using ((select auth.jwt()->>'aal') = 'aal2') with check ((select auth.jwt()->>'aal') = 'aal2');
create policy "require mfa" on public.lesson_progress as restrictive for all to authenticated
  using ((select auth.jwt()->>'aal') = 'aal2') with check ((select auth.jwt()->>'aal') = 'aal2');
create policy "require mfa" on public.member_state as restrictive for all to authenticated
  using ((select auth.jwt()->>'aal') = 'aal2') with check ((select auth.jwt()->>'aal') = 'aal2');
