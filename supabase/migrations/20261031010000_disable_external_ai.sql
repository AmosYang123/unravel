-- Build 12 removes third-party AI and other personalized external processing.
-- Reset every legacy opt-in so older clients are denied by the server too.
update public.profiles
set ai_suggestions_enabled = false,
    ai_consent_version = null
where ai_suggestions_enabled is distinct from false
   or ai_consent_version is not null;
