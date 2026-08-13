-- v14: 같은 근무자의 대휴(leave) 두 개가 같은 원래근무일(leave_for_date)을 가리키지 못하게
-- DB에서 1:1로 강제한다. (근무자가 다르면 leave_for_date가 같아도 문제 없음 — 각자 자기 근무일)
-- Supabase 대시보드 > SQL Editor 에서 실행하세요.

-- 이 제약을 걸기 전에, 먼저 아래 쿼리로 이미 중복된 데이터가 있는지 확인하세요.
-- 결과가 있다면(각 행이 "같은 근무자가 같은 원래근무일을 가리키는 대휴가 N개" 라는 뜻),
-- 화면에서 해당 대휴들을 열어 원래근무일을 다르게 고쳐준 뒤에 아래 create unique index를 실행해야
-- 성공합니다(중복이 남아있으면 제약 생성 자체가 실패해요).
--
-- select employee_id, leave_for_date, count(*)
-- from shifts
-- where shift_type = 'leave' and leave_for_date is not null
-- group by employee_id, leave_for_date
-- having count(*) > 1;

create unique index if not exists shifts_leave_for_date_unique
  on shifts (employee_id, leave_for_date)
  where shift_type = 'leave' and leave_for_date is not null;
