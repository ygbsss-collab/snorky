-- 문의 접수: 브라우저는 Edge Function만 호출하고 이 테이블에는 직접 접근하지 않는다.
create table if not exists public.contact_inquiries (
  id bigint generated always as identity primary key,
  inquiry_type text not null check (inquiry_type in ('point_correction', 'point_report', 'other')),
  point_name text,
  content text not null,
  reply_email text,
  requester_ip_hash text not null,
  captcha_token text,
  admin_notification_status text not null default 'pending'
    check (admin_notification_status in ('pending', 'sent', 'failed', 'not_configured')),
  admin_notification_error text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint contact_inquiries_point_name_for_type check (
    (inquiry_type in ('point_correction', 'point_report')) or point_name is null
  )
);

create index if not exists idx_contact_inquiries_ip_created_at
  on public.contact_inquiries (requester_ip_hash, created_at desc);

alter table public.contact_inquiries enable row level security;
revoke all on public.contact_inquiries from anon, authenticated;
grant select, insert, update, delete on public.contact_inquiries to service_role;
grant usage, select on sequence public.contact_inquiries_id_seq to service_role;

notify pgrst, 'reload schema';
