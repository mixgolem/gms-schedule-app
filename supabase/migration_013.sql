-- v13: 근무패턴을 언제, 누가, 어떤 기간에 적용했는지 기록
-- Supabase 대시보드 > SQL Editor 에서 실행하세요.

create table if not exists shift_pattern_applications (
  id uuid primary key default gen_random_uuid(),
  pattern_id uuid references shift_patterns(id) on delete set null,
  applied_by uuid references auth.users(id) on delete set null,
  applied_by_email text,
  start_date date not null,
  end_date date not null,
  applied_at timestamptz not null default now()
);

alter table shift_pattern_applications enable row level security;

create policy "shift_pattern_applications_select_all" on shift_pattern_applications
  for select using (true);

create policy "shift_pattern_applications_write_authenticated" on shift_pattern_applications
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

alter publication supabase_realtime add table shift_pattern_applications;
