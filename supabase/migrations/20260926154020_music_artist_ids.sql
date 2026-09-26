-- Which Deezer artist each saved name means, when two artists share a name.
-- Keyed by the name as stored in music_artists; a missing key means "the
-- best-known artist with that name".
alter table public.profiles
  add column if not exists music_artist_ids jsonb not null default '{}'::jsonb;
