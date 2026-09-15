-- v19: 로그인 계정을 관리자/일반으로 나눠서, 편집은 관리자만 가능하게 하기
-- 지금까지는 "로그인만 하면" 편집(쓰기)까지 다 가능했다. 이제 계정의 app_metadata.role이
-- 'admin'인 사람만 편집할 수 있고, 나머지 로그인 계정은 조회만 가능하도록 좁힌다.
--
-- role은 본인이 못 바꾸는 app_metadata(= JWT의 app_metadata 클레임)에 저장한다 — 이래야
-- 계정 주인이 자기 자신을 관리자로 못 올린다. 부여는 Supabase 대시보드에서 해야 한다:
--   Authentication > Users > 대상 계정 선택 > Edit user > "Raw App Meta Data"에
--   {"role": "admin"} 추가 (기존 내용이 있으면 합쳐서 { ...기존, "role": "admin" })
-- 관리자로 지정 안 한 계정은 로그인은 되지만 조회만 가능(수정 시도하면 이 정책에 막혀
-- 실패하고, 화면에서도 편집 버튼 자체가 안 보인다).
--
-- Supabase 대시보드 > SQL Editor 에서 실행하세요.

drop policy if exists "employees_write_authenticated" on employees;
create policy "employees_write_admin" on employees
  for all using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "shifts_write_authenticated" on shifts;
create policy "shifts_write_admin" on shifts
  for all using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "holidays_write_authenticated" on holidays;
create policy "holidays_write_admin" on holidays
  for all using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "notice_write_authenticated" on notice;
create policy "notice_write_admin" on notice
  for all using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "comp_leave_monthly_write_authenticated" on comp_leave_monthly;
create policy "comp_leave_monthly_write_admin" on comp_leave_monthly
  for all using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "comp_leave_summary_write_authenticated" on comp_leave_summary;
create policy "comp_leave_summary_write_admin" on comp_leave_summary
  for all using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "annual_leave_allocation_write_authenticated" on annual_leave_allocation;
create policy "annual_leave_allocation_write_admin" on annual_leave_allocation
  for all using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "shift_leave_usage_write_authenticated" on shift_leave_usage;
create policy "shift_leave_usage_write_admin" on shift_leave_usage
  for all using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "shift_type_defaults_write_authenticated" on shift_type_defaults;
create policy "shift_type_defaults_write_admin" on shift_type_defaults
  for all using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "shift_patterns_write_authenticated" on shift_patterns;
create policy "shift_patterns_write_admin" on shift_patterns
  for all using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "shift_pattern_applications_write_authenticated" on shift_pattern_applications;
create policy "shift_pattern_applications_write_admin" on shift_pattern_applications
  for all using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- user_preferences(본인 설정만 읽고 쓰는 것 — 근무 색상 on/off 같은 개인 화면 설정)는
-- 편집 권한과 무관하게 로그인한 사람이면 누구나 자기 것만 건드릴 수 있어야 하니 그대로 둔다.
-- audit_log는 원래도 클라이언트가 직접 쓰는 정책이 없어서(트리거로만 기록) 그대로 둔다.
