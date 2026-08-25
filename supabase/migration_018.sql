-- v18: 로그인 안 한 사용자는 조회(select)도 못 하게 막기
-- 지금까지는 아래 테이블들이 전부 "select using (true)"라서, 로그인 여부와 상관없이
-- (프론트엔드 우회해서 API를 직접 불러도) 누구나 데이터를 읽을 수 있었다. 이제 화면단
-- 안내("조회 전용")를 없애고 로그인해야만 볼 수 있게 바꾸는 김에, 실제 접근 제어인 RLS도
-- 함께 인증된 사용자 전용으로 좁힌다.
-- Supabase 대시보드 > SQL Editor 에서 실행하세요.

drop policy if exists "employees_select_all" on employees;
create policy "employees_select_authenticated" on employees
  for select using (auth.role() = 'authenticated');

drop policy if exists "shifts_select_all" on shifts;
create policy "shifts_select_authenticated" on shifts
  for select using (auth.role() = 'authenticated');

drop policy if exists "holidays_select_all" on holidays;
create policy "holidays_select_authenticated" on holidays
  for select using (auth.role() = 'authenticated');

drop policy if exists "notice_select_all" on notice;
create policy "notice_select_authenticated" on notice
  for select using (auth.role() = 'authenticated');

drop policy if exists "comp_leave_monthly_select_all" on comp_leave_monthly;
create policy "comp_leave_monthly_select_authenticated" on comp_leave_monthly
  for select using (auth.role() = 'authenticated');

drop policy if exists "comp_leave_summary_select_all" on comp_leave_summary;
create policy "comp_leave_summary_select_authenticated" on comp_leave_summary
  for select using (auth.role() = 'authenticated');

drop policy if exists "annual_leave_allocation_select_all" on annual_leave_allocation;
create policy "annual_leave_allocation_select_authenticated" on annual_leave_allocation
  for select using (auth.role() = 'authenticated');

drop policy if exists "shift_leave_usage_select_all" on shift_leave_usage;
create policy "shift_leave_usage_select_authenticated" on shift_leave_usage
  for select using (auth.role() = 'authenticated');

drop policy if exists "shift_type_defaults_select_all" on shift_type_defaults;
create policy "shift_type_defaults_select_authenticated" on shift_type_defaults
  for select using (auth.role() = 'authenticated');

drop policy if exists "shift_patterns_select_all" on shift_patterns;
create policy "shift_patterns_select_authenticated" on shift_patterns
  for select using (auth.role() = 'authenticated');

drop policy if exists "shift_pattern_applications_select_all" on shift_pattern_applications;
create policy "shift_pattern_applications_select_authenticated" on shift_pattern_applications
  for select using (auth.role() = 'authenticated');

-- user_preferences(auth.uid() = user_id)와 audit_log(authenticated 전용)는 이미 비로그인
-- 사용자를 걸러내고 있어서 그대로 둔다.
