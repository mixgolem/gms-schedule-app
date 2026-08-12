-- GMS 근무 스케줄 - 통합 스키마 (schema.sql + migration_002~010을 최종 상태로 합친 버전)
-- 새 Supabase 프로젝트에 이 파일 하나만 SQL Editor에서 실행하면 지금 운영 중인 DB와 동일한
-- 상태로 세팅된다. 이미 운영 중인 기존 프로젝트에는 실행하지 말 것 (버전별 migration_00X.sql을
-- 순서대로 실행해 온 상태라면 이미 아래 내용이 전부 반영돼 있음).
--
-- 실행 후 초기 데이터가 필요하면 seed.sql을 이어서 실행하세요.

create extension if not exists "pgcrypto";

-- ============================================================
-- 테이블
-- ============================================================

create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  employee_number text, -- 사번, 미입력 허용
  sort_order int not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 사번은 입력하면 중복 불가, 비워두는 건 여러 명 허용
create unique index if not exists employees_employee_number_unique
  on employees (employee_number)
  where employee_number is not null;

create table if not exists shifts (
  id uuid primary key default gen_random_uuid(),
  work_date date not null,
  employee_id uuid not null references employees(id) on delete cascade,
  shift_type text not null check (shift_type in ('dawn', 'day', 'night', 'off', 'leave', 'annual')),
  is_main boolean not null default false,
  start_time time,
  end_time time,
  leave_for_date date, -- 대휴(leave)일 때, 보상 대상인 원래 근무일
  -- 아래 3개는 v7 구조개편(근무 중 부분 연차/대휴는 shift_leave_usage로 관리) 이전의 레거시 컬럼.
  -- 현재 애플리케이션은 항상 false/null로만 쓰지만, DB 컬럼 자체는 과거 데이터 호환을 위해 유지.
  is_personal_leave boolean not null default false,
  leave_hours numeric,
  annual_hours numeric,
  updated_at timestamptz not null default now(),
  unique (work_date, employee_id)
);

-- 같은 날짜 + 같은 근무타입(새벽/야간)에는 메인당직자가 1명만 존재
create unique index if not exists one_main_per_shift
  on shifts (work_date, shift_type)
  where is_main = true;

create index if not exists shifts_work_date_idx on shifts (work_date);

create table if not exists holidays (
  work_date date primary key,
  name text,
  created_at timestamptz not null default now()
);

create table if not exists notice (
  id int primary key default 1 check (id = 1),
  content text not null default '',
  updated_at timestamptz not null default now()
);

insert into notice (id, content) values (1, '') on conflict (id) do nothing;

-- 대체휴무 내역 - 월별 발생시간(수기입력)
create table if not exists comp_leave_monthly (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  year int not null,
  month int not null check (month between 1 and 12),
  hours numeric not null default 0,
  unique (employee_id, year, month)
);

-- 대체휴무 내역 - 회계연도별 사용누적시간(수기입력)
create table if not exists comp_leave_summary (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  fiscal_year int not null, -- 캘린더 연도 기준 (예: 2026 = 2025년12월~2026년11월)
  used_hours numeric not null default 0,
  unique (employee_id, fiscal_year)
);

-- 연차 내역 - 회계연도별 할당시간(수기입력). year는 회계연도 시작연도(7월)를 뜻함
-- (예: year=2026은 2026년 7월~2027년 6월)
create table if not exists annual_leave_allocation (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  year int not null,
  allocated_hours numeric not null default 0,
  unique (employee_id, year)
);

-- 새벽/야간/주간 근무 중 일부 시간만 연차/본인대휴/기타로 쓰는 경우의 서브엔트리
create table if not exists shift_leave_usage (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references shifts(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  work_date date not null,
  usage_type text not null check (usage_type in ('annual', 'personal_leave', 'other')),
  hours numeric not null,
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now()
);

-- 새벽/주간/야간 근무의 기본 출퇴근시각 (웹에서 직접 설정 가능)
create table if not exists shift_type_defaults (
  shift_type text primary key check (shift_type in ('dawn', 'day', 'night')),
  start_time time not null,
  end_time time not null
);

insert into shift_type_defaults (shift_type, start_time, end_time) values
  ('dawn', '06:30', '15:30'),
  ('day', '09:00', '18:00'),
  ('night', '15:00', '00:00') -- 24:00 대신 익일 00:00로 저장
on conflict (shift_type) do nothing;

-- 로그인 계정별 UI 설정(근무 색상 표시, 정렬 방식)
create table if not exists user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  show_colors boolean not null default true,
  sort_mode text not null default 'default' check (sort_mode in ('default', 'byShiftType')),
  updated_at timestamptz not null default now()
);

-- 반복 근무패턴(예: 7명 49일 순환) 업로드 이력. 가장 최근 행이 "현재 등록된 패턴"
create table if not exists shift_patterns (
  id uuid primary key default gen_random_uuid(),
  uploaded_by uuid references auth.users(id) on delete set null,
  uploaded_by_email text,
  filename text not null,
  uploaded_at timestamptz not null default now(),
  pattern jsonb not null
);

-- 근무패턴을 언제, 누가, 어떤 기간에 적용했는지 이력. 가장 최근 행이 "현재 적용된 기간"
create table if not exists shift_pattern_applications (
  id uuid primary key default gen_random_uuid(),
  pattern_id uuid references shift_patterns(id) on delete set null,
  applied_by uuid references auth.users(id) on delete set null,
  applied_by_email text,
  start_date date not null,
  end_date date not null,
  applied_at timestamptz not null default now()
);

-- ============================================================
-- Row Level Security - 모든 테이블 공통: 누구나 조회, 로그인한 사용자만 편집
-- ============================================================

alter table employees enable row level security;
alter table shifts enable row level security;
alter table holidays enable row level security;
alter table notice enable row level security;
alter table comp_leave_monthly enable row level security;
alter table comp_leave_summary enable row level security;
alter table annual_leave_allocation enable row level security;
alter table shift_leave_usage enable row level security;
alter table shift_type_defaults enable row level security;
alter table user_preferences enable row level security;
alter table shift_patterns enable row level security;
alter table shift_pattern_applications enable row level security;

create policy "employees_select_all" on employees for select using (true);
create policy "employees_write_authenticated" on employees
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "shifts_select_all" on shifts for select using (true);
create policy "shifts_write_authenticated" on shifts
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "holidays_select_all" on holidays for select using (true);
create policy "holidays_write_authenticated" on holidays
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "notice_select_all" on notice for select using (true);
create policy "notice_write_authenticated" on notice
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "comp_leave_monthly_select_all" on comp_leave_monthly for select using (true);
create policy "comp_leave_monthly_write_authenticated" on comp_leave_monthly
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "comp_leave_summary_select_all" on comp_leave_summary for select using (true);
create policy "comp_leave_summary_write_authenticated" on comp_leave_summary
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "annual_leave_allocation_select_all" on annual_leave_allocation for select using (true);
create policy "annual_leave_allocation_write_authenticated" on annual_leave_allocation
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "shift_leave_usage_select_all" on shift_leave_usage for select using (true);
create policy "shift_leave_usage_write_authenticated" on shift_leave_usage
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "shift_type_defaults_select_all" on shift_type_defaults for select using (true);
create policy "shift_type_defaults_write_authenticated" on shift_type_defaults
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- user_preferences는 다른 테이블과 달리 본인 설정만 보고 고칠 수 있음
create policy "user_preferences_select_own" on user_preferences
  for select using (auth.uid() = user_id);
create policy "user_preferences_write_own" on user_preferences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "shift_patterns_select_all" on shift_patterns for select using (true);
create policy "shift_patterns_write_authenticated" on shift_patterns
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "shift_pattern_applications_select_all" on shift_pattern_applications
  for select using (true);
create policy "shift_pattern_applications_write_authenticated" on shift_pattern_applications
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ============================================================
-- Realtime 구독 활성화
-- ============================================================

alter publication supabase_realtime add table shifts;
alter publication supabase_realtime add table employees;
alter publication supabase_realtime add table shift_patterns;
alter publication supabase_realtime add table shift_pattern_applications;
alter publication supabase_realtime add table holidays;
alter publication supabase_realtime add table notice;
alter publication supabase_realtime add table comp_leave_monthly;
alter publication supabase_realtime add table comp_leave_summary;
alter publication supabase_realtime add table annual_leave_allocation;
alter publication supabase_realtime add table shift_leave_usage;
alter publication supabase_realtime add table shift_type_defaults;
