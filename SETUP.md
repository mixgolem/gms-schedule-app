# 설정 가이드 (사용자가 직접 해야 하는 부분)

## 1. Supabase 프로젝트 생성
1. https://supabase.com 가입 후 새 프로젝트 생성 (무료 티어)
2. 프로젝트 대시보드 > **SQL Editor**에서 `supabase/` 폴더의 파일을 실행
   - **새 프로젝트라면**: `schema_full.sql` 하나만 실행하면 됨 (지금까지의 모든 변경사항이 최종 상태로 합쳐진 파일). 이어서 초기 직원 데이터가 필요하면 `seed.sql`도 실행
   - `schema.sql` + `migration_002.sql` ~ `migration_017.sql`은 지금까지 실제로 적용해 온 변경 이력(버전별 기록)이라 남겨둔 것 — 이미 운영 중인 기존 프로젝트가 아니라면 개별적으로 실행할 필요 없음
3. 대시보드 > **Project Settings > API**에서 다음 값을 복사
   - `Project URL`
   - `anon public` key

## 2. 환경변수 설정
프로젝트 루트에 `.env.local` 파일을 만들고 아래처럼 채워주세요 (`.env.local.example` 참고):

```
NEXT_PUBLIC_SUPABASE_URL=복사한 Project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=복사한 anon key
```

## 3. 로그인 계정 만들기
대시보드 > **Authentication > Users > Add user**에서 편집 권한이 필요한 사람 수만큼 이메일/비밀번호 계정을 만들어주세요.
(회원가입 화면은 따로 안 만들었어요 — 팀원 전용 앱이라 관리자가 계정을 미리 만들어주는 방식입니다.)

Authentication > Providers > Email에서 "Confirm email"을 꺼두면, 계정 생성 즉시 비밀번호로 로그인할 수 있어요 (이메일 인증 절차 생략).

## 4. 로컬 실행
```
npm install
npm run dev
```
http://localhost:3000 접속 → 로그인 안 하면 조회만, 로그인하면 편집 가능합니다.

## 5. 배포 (Vercel)
1. 이 프로젝트를 GitHub 저장소로 push
2. https://vercel.com 가입 후 해당 저장소 Import
3. Vercel 프로젝트 설정 > Environment Variables에 `.env.local`과 동일한 두 값 등록
4. Deploy → 발급된 URL로 외부/모바일에서 접속 가능