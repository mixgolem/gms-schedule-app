-- v2: 근무시간 직접 입력 + 공휴일 지정
-- Supabase 대시보드 > SQL Editor 에서 실행하세요.

alter table shifts add column if not exists start_time time;
alter table shifts add column if not exists end_time time;

create table if not exists holidays (
  work_date date primary key,
  name text,
  created_at timestamptz not null default now()
);

alter table holidays enable row level security;

create policy "holidays_select_all" on holidays for select using (true);

create policy "holidays_write_authenticated" on holidays
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- 직원/공휴일 변경도 실시간으로 반영되도록 publication에 추가
alter publication supabase_realtime add table employees;
alter publication supabase_realtime add table holidays;
