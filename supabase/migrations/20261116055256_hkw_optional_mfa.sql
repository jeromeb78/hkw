-- Two-step verification becomes optional. Members who turned it on must use it (aal2);
-- members without a verified authenticator can use their password session (aal1).

create or replace function public.mfa_satisfied()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((auth.jwt() ->> 'aal') = 'aal2', false)
      or not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified');
$$;
revoke execute on function public.mfa_satisfied() from public, anon;
grant execute on function public.mfa_satisfied() to authenticated;

drop policy "require mfa" on public.profiles;
drop policy "require mfa" on public.lesson_progress;
drop policy "require mfa" on public.member_state;
drop policy "own redemptions read" on public.redemptions;
create policy "require mfa if enabled" on public.profiles as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
create policy "require mfa if enabled" on public.lesson_progress as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
create policy "require mfa if enabled" on public.member_state as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
create policy "own redemptions read" on public.redemptions for select to authenticated
  using ((select auth.uid()) = user_id and (select public.mfa_satisfied()));

create or replace function public.redeem_invite(p_code text)
returns json language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); ok boolean;
begin
  if uid is null or not public.mfa_satisfied() then
    raise exception 'Sign in first (with your authenticator code if two-step verification is on)' using errcode = '42501';
  end if;
  if (select count(*) from public.promo_attempts where user_id = uid and attempted_at > now() - interval '1 hour') >= 10 then
    raise exception 'HKW_RATE_LIMIT: too many code attempts, try again later' using errcode = 'P0001';
  end if;
  insert into public.promo_attempts (user_id) values (uid);
  ok := public.apply_promo(uid, left(p_code, 60));
  return (select json_build_object('ok', ok, 'plan', plan, 'plan_expires_at', plan_expires_at)
            from public.profiles where id = uid);
end; $$;

create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); em text;
begin
  if uid is null or not public.mfa_satisfied() then
    raise exception 'Sign in first (with your authenticator code if two-step verification is on)' using errcode = '42501';
  end if;
  select email into em from auth.users where id = uid;
  delete from public.beta_signups where lower(email) = lower(em);
  delete from public.contact_messages where lower(email) = lower(em);
  delete from auth.users where id = uid;
end; $$;
