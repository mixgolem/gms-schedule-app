-- v20: 근무표 칸의 "시간 막대" 보기 설정을 계정별로 기억한다.
-- 켜면 근무자 한 줄이 [이름 | 시간 막대]로 나뉘고, 막대는 가장 이른 출근~가장 늦은 퇴근
-- (근무시간 설정 기준, 예: 06:30~24:00) 전체 중 실제 근무 시간대만 색칠해서 보여준다.
-- 기본값은 꺼짐(false) — 필요한 사람만 화면 왼쪽 "시간 막대" 버튼으로 켜서 쓴다.
--
-- 예전에 기본값 켜짐(true)으로 이 컬럼을 먼저 만들었던 경우에도 그대로 다시 실행하면 되게
-- 짜여 있다(기본값을 꺼짐으로 바꾸고, 이미 저장된 값도 전부 꺼짐으로 되돌린다).
--
-- Supabase 대시보드 > SQL Editor 에서 실행하세요.

alter table user_preferences
  add column if not exists show_time_bar boolean not null default false;

alter table user_preferences
  alter column show_time_bar set default false;

update user_preferences set show_time_bar = false;
