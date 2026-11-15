-- Her Kingdom Wealth initial schema.
-- Applied to the HKW Supabase project (ref ifysjtiphdvamocosngp) on 2026-11-15.
-- Never store: safety question answer, SSNs, bank/brokerage account numbers or logins.

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;

-- Member profile (one row per auth user)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text, last_name text, email text, phone text,
  country text default 'United States',
  tier text check (tier in ('seed','sower','steward','kingdom')),
  archetype text, risk_band text, season text,
  plan text not null default 'complimentary'
    check (plan in ('complimentary','premium','circle','vip','sisters_keeper')),
  email_consent boolean not null default false, email_consent_at timestamptz,
  sms_consent boolean not null default false, sms_consent_at timestamptz,
  discreet_notifications boolean not null default false,
  messages_paused boolean not null default false,
  source text check (source in ('app','manychat','promo','beta')),
  referred_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create index profiles_referred_by_idx on public.profiles(referred_by);

-- Lesson progress
create table public.lesson_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_key text not null check (lesson_key ~ '^(seed|sower|steward|kingdom)-[0-9]$'),
  quiz_score smallint check (quiz_score between 0 and 10),
  completed_at timestamptz not null default now(),
  primary key (user_id, lesson_key)
);

-- Private app state (saved tools, Why card, Wealth Journey, action steps). Never synced to GoHighLevel.
create table public.member_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create trigger member_state_updated_at before update on public.member_state
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.member_state enable row level security;

create policy "own profile read" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "own profile update" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "own progress read" on public.lesson_progress for select to authenticated using ((select auth.uid()) = user_id);
create policy "own progress write" on public.lesson_progress for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own progress update" on public.lesson_progress for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own state read" on public.member_state for select to authenticated using ((select auth.uid()) = user_id);
create policy "own state write" on public.member_state for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own state update" on public.member_state for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Plan is billing-controlled (Stripe webhook via service role); members cannot change it themselves.
revoke update (plan) on public.profiles from authenticated;

-- Create a profile row when an auth user is created.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, first_name, last_name)
  values (new.id, new.email,
          new.raw_user_meta_data->>'first_name', new.raw_user_meta_data->>'last_name');
  return new;
end; $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Beta / app sign-ups from the public form (insert-only for visitors; read via dashboard or service role)
create table public.beta_signups (
  id bigint generated always as identity primary key,
  first_name text not null check (char_length(first_name) between 1 and 100),
  last_name text check (char_length(last_name) <= 100),
  email text not null check (char_length(email) <= 254 and email ~ '^\S+@\S+\.\S+$'),
  phone text check (char_length(phone) <= 30),
  country text check (char_length(country) <= 80),
  invite_code text check (char_length(invite_code) <= 40),
  plan text check (plan in ('complimentary','premium')),
  email_consent boolean not null default false,
  sms_consent boolean not null default false,
  disclaimer_ack boolean not null default false,
  consent_at timestamptz not null default now(),
  source text not null default 'app' check (source in ('app','beta','manychat','promo')),
  ghl_synced_at timestamptz,
  created_at timestamptz not null default now()
);
create index beta_signups_email_idx on public.beta_signups(lower(email));

-- Contact Us messages (insert-only for visitors)
create table public.contact_messages (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 1 and 120),
  email text not null check (char_length(email) <= 254 and email ~ '^\S+@\S+\.\S+$'),
  topic text not null check (char_length(topic) <= 80),
  message text not null check (char_length(message) between 1 and 1000),
  ghl_synced_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.beta_signups enable row level security;
alter table public.contact_messages enable row level security;
create policy "public can submit signup" on public.beta_signups for insert to anon, authenticated
  with check (ghl_synced_at is null);
create policy "public can submit contact" on public.contact_messages for insert to anon, authenticated
  with check (ghl_synced_at is null);
