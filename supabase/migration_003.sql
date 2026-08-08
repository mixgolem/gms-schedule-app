-- v3: '대휴(leave)' 근무상태 추가
-- Supabase 대시보드 > SQL Editor 에서 실행하세요.

alter table shifts drop constraint if exists shifts_shift_type_check;
alter table shifts add constraint shifts_shift_type_check
  check (shift_type in ('dawn', 'day', 'night', 'off', 'leave'));
