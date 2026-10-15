-- v23: 화면 테마(기본/리퀴드 글래스 × 라이트/다크)를 계정별로 기억한다.
-- 지금까지는 브라우저에만 저장돼서 다른 PC·휴대폰에서는 기본값으로 보였는데, 이제 어느
-- 기기로 로그인해도 마지막에 고른 테마로 보인다. 비어 있으면(null) 기본값(리퀴드 글래스·라이트).
-- user_preferences의 기존 "본인 행만" 권한 그대로라 다른 사람 설정은 못 보고 못 바꾼다.
--
-- Supabase 대시보드 > SQL Editor 에서 실행하세요.

alter table user_preferences
  add column if not exists theme_style text check (theme_style in ('basic', 'glass'));

alter table user_preferences
  add column if not exists theme_mode text check (theme_mode in ('light', 'dark'));
