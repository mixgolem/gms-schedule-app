-- v22: "내 근무" 표시와 백업 알림.
--
-- 1) user_preferences.my_employee_id — 로그인한 사람이 근무표에서 "나는 이 직원"이라고 직접
--    골라두는 칸. 고르면 다음 로그인부터 내 줄이 자동으로 강조되고, 화면 위에 내 요약(오늘 근무·
--    다음 근무·남은 연차/대휴)이 뜬다. 화면 표시용 설정일 뿐이라 본인 설정 행에만 저장된다
--    (user_preferences의 기존 "본인 행만" 권한 그대로). 직원 전체 복원 때 직원 행이 지워졌다
--    다시 들어와도 연결이 풀리지 않게 외래키는 걸지 않는다(못 찾으면 그냥 표시 안 함).
--
-- 2) backup_log — 관리자가 "JSON 백업"을 받을 때마다 한 줄씩 기록. 마지막 백업이 오래되면
--    JSON 백업 버튼과 DEV 메뉴에 알림을 띄운다. 관리자만 조회·기록할 수 있다.
--
-- Supabase 대시보드 > SQL Editor 에서 실행하세요.

alter table user_preferences
  add column if not exists my_employee_id uuid;

create table if not exists backup_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  created_by_email text
);

create index if not exists backup_log_created_at_idx on backup_log (created_at desc);

alter table backup_log enable row level security;

drop policy if exists "backup_log_select_admin" on backup_log;
create policy "backup_log_select_admin" on backup_log
  for select using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "backup_log_insert_admin" on backup_log;
create policy "backup_log_insert_admin" on backup_log
  for insert with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
