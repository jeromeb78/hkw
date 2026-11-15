-- Members may update only these profile columns; plan, plan_expires_at, email, source, referred_by are server-controlled.
revoke update on public.profiles from anon, authenticated;
grant update (first_name, last_name, phone, country, tier, archetype, risk_band, season,
              email_consent, email_consent_at, sms_consent, sms_consent_at,
              discreet_notifications, messages_paused) on public.profiles to authenticated;
