-- Articles recently put on this person's Reading shelf, newest first, so
-- "Find newer articles" never brings one back. Capped by article-recs.
alter table public.profiles
  add column if not exists seen_article_urls text[] not null default '{}';
