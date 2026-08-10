-- v6: 근무형태에 '연차' 추가 + 연차 내역 원장
-- Supabase 대시보드 > SQL Editor 에서 실행하세요.

alter table shifts drop constraint if exists shifts_shift_type_check;
alter table shifts add constraint shifts_shift_type_check
  check (shift_type in ('dawn', 'day', 'night', 'off', 'leave', 'annual'));

alter table shifts add column if not exists annual_hours numeric;

create table if not exists annual_leave_allocation (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  year int not null,
  allocated_hours numeric not null default 0,
  unique (employee_id, year)
);

alter table annual_leave_allocation enable row level security;

create policy "annual_leave_allocation_select_all" on annual_leave_allocation for select using (true);

create policy "annual_leave_allocation_write_authenticated" on annual_leave_allocation
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

alter publication supabase_realtime add table annual_leave_allocation;
