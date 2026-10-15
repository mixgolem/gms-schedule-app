"use client";

import { ReactNode, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAuth, useResetMonth, useToast } from "@/app/providers";
import EmployeeManagerModal from "./EmployeeManagerModal";
import UploadScheduleModal from "./UploadScheduleModal";
import ShiftDefaultsModal from "./ShiftDefaultsModal";
import FullRestoreModal from "./FullRestoreModal";
import ShiftPatternModal from "./ShiftPatternModal";
import WeekendCompLeaveModal from "./WeekendCompLeaveModal";
import HolidayManagerModal from "./HolidayManagerModal";
import ResetScheduleModal from "./ResetScheduleModal";
import AuditLogModal from "./AuditLogModal";
import DevInfoModal from "./DevInfoModal";
import PasswordChangeModal from "./PasswordChangeModal";
import AccountPasswordResetModal from "./AccountPasswordResetModal";
import { recordBackup, useLastBackup } from "@/lib/backupLog";
import { Theme, useTheme } from "@/lib/theme";
import Button from "./ui/Button";
import DropdownMenu from "./ui/DropdownMenu";
import { exportFullBackupJson } from "@/lib/fullBackupExport";

const MENU_ITEM_CLASS = "w-full justify-start whitespace-nowrap";

// 다른 메뉴 버튼과 배경·테두리는 똑같이 두고, 글자색만 빨간색으로 바꿔서 "위험한 작업
// 모음"이라는 걸 표시하는 트리거. !important로 강제하지 않으면 variant/active의 글자색이
// 이걸 덮어쓴다. 평소(흰 배경)엔 진한 빨강, 열렸을 때(진한 남색 배경)는 밝은 빨강을 써서
// 배경과의 대비를 유지한다.
function DangerMenu({ children }: { children: ReactNode }) {
  return (
    <DropdownMenu
      label="초기화/복원"
      triggerClassName={(open) => (open ? "!text-red-300" : "!text-red-600")}
    >
      {children}
    </DropdownMenu>
  );
}

const SEGMENT_CLASS = "flex-1 justify-center px-2 py-1 text-xs whitespace-nowrap";

// 계정 메뉴 안의 테마 고르기: 스타일(기본/리퀴드 글래스) × 밝기(라이트/다크). 계정에 기억된다.
// 버튼을 눌러도 메뉴가 닫히지 않게 클릭이 메뉴 바깥으로 전달되지 않도록 막는다.
function ThemePicker({
  theme,
  setTheme,
}: {
  theme: Theme;
  setTheme: (patch: Partial<Theme>) => void;
}) {
  return (
    <div
      className="flex flex-col gap-1 border-y border-gray-100 py-1.5 my-0.5 min-w-[13rem]"
      onClick={(e) => e.stopPropagation()}
    >
      <p className="px-1 text-[11px] font-semibold text-black">🎨 화면 테마</p>
      <div className="flex gap-1">
        <Button className={SEGMENT_CLASS} active={theme.style === "basic"} onClick={() => setTheme({ style: "basic" })}>
          기본
        </Button>
        <Button className={SEGMENT_CLASS} active={theme.style === "glass"} onClick={() => setTheme({ style: "glass" })}>
          리퀴드 글래스
        </Button>
      </div>
      <div className="flex gap-1">
        <Button className={SEGMENT_CLASS} active={theme.mode === "light"} onClick={() => setTheme({ mode: "light" })}>
          ☀️ 라이트
        </Button>
        <Button className={SEGMENT_CLASS} active={theme.mode === "dark"} onClick={() => setTheme({ mode: "dark" })}>
          🌙 다크
        </Button>
      </div>
    </div>
  );
}

export default function Header() {
  const { session, signOut, loading, canEdit } = useAuth();
  const { info: resetInfo } = useResetMonth();
  const { showToast } = useToast();
  const [managerOpen, setManagerOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [defaultsOpen, setDefaultsOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [patternOpen, setPatternOpen] = useState(false);
  const [weekendCompLeaveOpen, setWeekendCompLeaveOpen] = useState(false);
  const [holidayManagerOpen, setHolidayManagerOpen] = useState(false);
  const [resetScheduleOpen, setResetScheduleOpen] = useState(false);
  const [auditLogOpen, setAuditLogOpen] = useState(false);
  const [devInfoOpen, setDevInfoOpen] = useState(false);

  // 메뉴가 닫혀 있어도 로그인하자마자 계정 테마를 불러와야 해서 여기(항상 떠 있는 헤더)서 쓴다
  const { theme, setTheme } = useTheme(session?.user.id ?? null);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [accountResetOpen, setAccountResetOpen] = useState(false);
  // 관리자가 임시 비밀번호를 발급한 계정이면 로그인하자마자 비밀번호 변경 창을 띄운다
  // ("나중에 바꾸기"를 누르면 이번 접속 동안은 다시 안 띄움).
  const [forcedDismissed, setForcedDismissed] = useState(false);
  const mustChangePassword = session?.user.user_metadata?.must_change_password === true;
  const showForcedPassword = mustChangePassword && !forcedDismissed;
  const accountName = session?.user.email?.split("@")[0] ?? "";
  const { last: lastBackup, stale: backupStale, refresh: refreshLastBackup } = useLastBackup(canEdit);

  const handleFullBackup = async () => {
    const { error } = await exportFullBackupJson();
    if (error) {
      window.alert(error);
      return;
    }
    await recordBackup(session?.user.email ?? null);
    refreshLastBackup();
    showToast("다운로드 완료!");
  };

  const backupTitle =
    "직원/근무표/공휴일/공지사항/근무시간설정 등 DB 전체를 있는 그대로 JSON으로 백업해요" +
    (lastBackup
      ? `\n마지막 백업: ${new Date(lastBackup.createdAt).toLocaleString("ko-KR")} (${lastBackup.daysAgo}일 전)`
      : "\n마지막 백업 기록 없음");

  return (
    <header className="app-header sticky top-0 z-30 h-16 flex items-center justify-between px-4 py-3 border-b border-blue-950 bg-blue-900 shadow-md">
      <span className="flex items-center gap-2.5 shrink-0">
        {/* 로고 글씨가 진한 남색이라 남색 헤더 위에선 흰 카드를 깔아서 보이게 한다 */}
        <span className="logo-card flex items-center bg-white rounded-md px-1.5 py-1">
          <Image
            src="/logo-ksl.png"
            alt="KSPO&KSL 한국스포츠레저주식회사"
            width={1914}
            height={591}
            priority
            className="h-7 w-auto"
          />
        </span>
        <span className="font-semibold text-white">GMS 근무 스케줄</span>
      </span>
      {!loading && (
        <div className="text-sm">
          {session ? (
            <div className="flex items-center gap-2 flex-wrap">
              {canEdit && (
                <>
                  <Button onClick={() => setUploadOpen(true)}>근무표 업로드</Button>
                  <Button onClick={() => setPatternOpen(true)}>근무패턴 관리</Button>
                  <Button onClick={() => setWeekendCompLeaveOpen(true)}>주말:대휴 연결</Button>
                  <Button onClick={() => setManagerOpen(true)}>근무자 설정</Button>
                  <Button onClick={() => setDefaultsOpen(true)}>근무시간 설정</Button>
                  <Button onClick={() => setHolidayManagerOpen(true)}>공휴일 관리</Button>
                  <Button onClick={() => setAuditLogOpen(true)}>변경 이력</Button>
                  <Button onClick={handleFullBackup} title={backupTitle}>
                    JSON 백업
                    {backupStale && (
                      <span className="ml-0.5 rounded bg-amber-100 px-1 text-[11px] font-bold text-amber-800">
                        ⚠️ {lastBackup ? `${lastBackup.daysAgo}일 전` : "기록 없음"}
                      </span>
                    )}
                  </Button>
                  <DangerMenu>
                    <Button
                      variant="danger"
                      className={MENU_ITEM_CLASS}
                      onClick={() => setRestoreOpen(true)}
                    >
                      JSON 복원
                    </Button>
                    <Button
                      variant="danger"
                      className={`${MENU_ITEM_CLASS} !bg-red-50 gap-1.5`}
                      onClick={() => setResetScheduleOpen(true)}
                    >
                      <span aria-hidden>⚠️</span> 기간 초기화
                    </Button>
                    {resetInfo?.canReset && (
                      <Button
                        variant="danger"
                        className={`${MENU_ITEM_CLASS} !bg-red-50 gap-1.5`}
                        onClick={resetInfo.onReset}
                      >
                        <span aria-hidden>⚠️</span> 이번 달 초기화
                      </Button>
                    )}
                  </DangerMenu>
                  <Button
                    onClick={() => setDevInfoOpen(true)}
                    className="font-mono font-bold"
                    title="배포 버전, DB 상태, 구조 점검 등 개발자용 정보"
                  >
                    DEV
                  </Button>
                </>
              )}
              {/* 관리자 버튼이 많아 노트북 폭에서도 한 줄에 들어가게, 계정 관련은 메뉴 하나로 묶는다 */}
              <DropdownMenu
                label={
                  <>
                    <span className={`font-semibold ${canEdit ? "text-amber-600" : "opacity-70"}`}>
                      [{canEdit ? "관리자" : "사용자"}]
                    </span>
                    {accountName}
                  </>
                }
                title={session.user.email}
              >
                <p className="px-2 pt-1 pb-1.5 text-xs text-black border-b border-gray-100">
                  {session.user.email}
                </p>
                <Button className={MENU_ITEM_CLASS} onClick={() => setPasswordOpen(true)}>
                  🔑 비밀번호 변경
                </Button>
                {canEdit && (
                  <Button
                    className={MENU_ITEM_CLASS}
                    onClick={() => setAccountResetOpen(true)}
                    title="비밀번호를 잊은 직원 계정에 임시 비밀번호를 발급해요"
                  >
                    👥 계정 비밀번호 초기화
                  </Button>
                )}
                <ThemePicker theme={theme} setTheme={setTheme} />
                <Button className={MENU_ITEM_CLASS} onClick={signOut}>
                  로그아웃
                </Button>
              </DropdownMenu>
            </div>
          ) : (
            <Link
              href="/login"
              className="inline-flex items-center rounded-lg border border-blue-900 bg-white px-3 py-1.5 text-sm font-medium text-blue-900 transition-all duration-150 ease-out hover:-translate-y-0.5 hover:bg-blue-50 hover:shadow-sm active:translate-y-0"
            >
              로그인
            </Link>
          )}
        </div>
      )}

      <EmployeeManagerModal open={managerOpen} onClose={() => setManagerOpen(false)} />
      <UploadScheduleModal open={uploadOpen} onClose={() => setUploadOpen(false)} />
      <ShiftPatternModal open={patternOpen} onClose={() => setPatternOpen(false)} />
      <WeekendCompLeaveModal
        open={weekendCompLeaveOpen}
        onClose={() => setWeekendCompLeaveOpen(false)}
        calendarYear={resetInfo?.year ?? new Date().getFullYear()}
      />
      <HolidayManagerModal
        open={holidayManagerOpen}
        onClose={() => setHolidayManagerOpen(false)}
        calendarYear={resetInfo?.year ?? new Date().getFullYear()}
      />
      <ResetScheduleModal
        open={resetScheduleOpen}
        onClose={() => setResetScheduleOpen(false)}
        calendarYear={resetInfo?.year ?? new Date().getFullYear()}
      />
      <AuditLogModal open={auditLogOpen} onClose={() => setAuditLogOpen(false)} />
      <DevInfoModal open={devInfoOpen} onClose={() => setDevInfoOpen(false)} />
      <ShiftDefaultsModal open={defaultsOpen} onClose={() => setDefaultsOpen(false)} />
      <FullRestoreModal open={restoreOpen} onClose={() => setRestoreOpen(false)} />
      {session?.user.email && (
        <PasswordChangeModal
          open={passwordOpen || showForcedPassword}
          forced={showForcedPassword}
          email={session.user.email}
          onClose={() => {
            setPasswordOpen(false);
            if (mustChangePassword) setForcedDismissed(true);
          }}
        />
      )}
      {canEdit && (
        <AccountPasswordResetModal open={accountResetOpen} onClose={() => setAccountResetOpen(false)} />
      )}
    </header>
  );
}
