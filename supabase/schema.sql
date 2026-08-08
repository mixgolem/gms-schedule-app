-- GMS 근무 스케줄 - Supabase 스키마
-- Supabase 대시보드 > SQL Editor 에서 그대로 실행하세요.

create extension if not exists "pgcrypto";

create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order int not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists shifts (
  id uuid primary key default gen_random_uuid(),
  work_date date not null,
  employee_id uuid not null references employees(id) on delete cascade,
  shift_type text not null check (shift_type in ('dawn', 'day', 'night', 'off')),
  is_main boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (work_date, employee_id)
);

-- 같은 날짜 + 같은 근무타입(새벽/야간)에는 메인당직자가 1명만 존재
create unique index if not exists one_main_per_shift
  on shifts (work_date, shift_type)
  where is_main = true;

create index if not exists shifts_work_date_idx on shifts (work_date);

-- Row Level Security
alter table employees enable row level security;
alter table shifts enable row level security;

-- 누구나 조회 가능 (비로그인 포함)
create policy "employees_select_all" on employees for select using (true);
create policy "shifts_select_all" on shifts for select using (true);

-- 로그인한 사용자만 편집 가능
create policy "employees_write_authenticated" on employees
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "shifts_write_authenticated" on shifts
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Realtime 구독 활성화
alter publication supabase_realtime add table shifts;
