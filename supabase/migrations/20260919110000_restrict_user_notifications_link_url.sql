-- The app uses './...' relative paths or null for link_url.
-- If future links need another format, update this constraint and send-push-notification together.
alter table public.user_notifications
  add constraint user_notifications_link_url_safe
  check (
    link_url is null
    or (
      link_url ~ E'^\\./[A-Za-z0-9._~%/?&=#+-]*$'
      and position('//' in link_url) = 0
      and char_length(link_url) <= 300
    )
  );
