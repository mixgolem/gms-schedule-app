-- v7: 새벽/야간/주간 근무 중 부분적으로 연차/본인대휴를 사용하는 경우를 위한 서브엔트리 테이블
-- Supabase 대시보드 > SQL Editor 에서 실행하세요.

create table if not exists shift_leave_usage (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references shifts(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  work_date date not null,
  usage_type text not null check (usage_type in ('annual', 'personal_leave')),
  hours numeric not null,
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now()
);

alter table shift_leave_usage enable row level security;

create policy "shift_leave_usage_select_all" on shift_leave_usage for select using (true);

create policy "shift_leave_usage_write_authenticated" on shift_leave_usage
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

alter publication supabase_realtime add table shift_leave_usage;
