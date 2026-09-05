-- 기존 데이터는 일괄 변경하지 않고 신규 자기 자신 차단만 금지한다.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.buddy_blocks'::regclass
      and conname = 'chk_buddy_blocks_no_self_block'
  ) then
    alter table public.buddy_blocks
      add constraint chk_buddy_blocks_no_self_block
      check (blocker_user_id <> blocked_user_id) not valid;
  end if;
end $$;
