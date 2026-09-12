-- Signed-out callers have no business reaching these definer functions. Each
-- already fails closed for a null auth.uid(), but revoke explicitly rather than
-- relying on the PUBLIC revoke alone.
revoke execute on function public.consume_rate_limit(text, integer, integer) from anon;
revoke execute on function public.has_role(uuid, public.app_role)            from anon;
revoke execute on function public.wellness_metrics_overview()                from anon;
revoke execute on function public.wellness_metrics_weekly()                  from anon;
revoke execute on function public.wellness_metrics_trajectory()              from anon;
