-- v5: 대휴 종류 구분(주말근무 대휴 vs 본인 대휴 사용) + 대체휴무 내역 원장
-- Supabase 대시보드 > SQL Editor 에서 실행하세요.

alter table shifts add column if not exists is_personal_leave boolean not null default false;
alter table shifts add column if not exists leave_hours numeric;

create table if not exists comp_leave_monthly (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  year int not null,
  month int not null check (month between 1 and 12),
  hours numeric not null default 0,
  unique (employee_id, year, month)
);

create table if not exists comp_leave_summary (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  fiscal_year int not null, -- 캘린더 연도 기준 (예: 2026 = 2025년12월~2026년11월)
  used_hours numeric not null default 0,
  unique (employee_id, fiscal_year)
);

alter table comp_leave_monthly enable row level security;
alter table comp_leave_summary enable row level security;

create policy "comp_leave_monthly_select_all" on comp_leave_monthly for select using (true);
create policy "comp_leave_monthly_write_authenticated" on comp_leave_monthly
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "comp_leave_summary_select_all" on comp_leave_summary for select using (true);
create policy "comp_leave_summary_write_authenticated" on comp_leave_summary
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

alter publication supabase_realtime add table comp_leave_monthly;
alter publication supabase_realtime add table comp_leave_summary;
