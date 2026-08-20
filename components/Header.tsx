"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import Link from "next/link";
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
import Button from "./ui/Button";
import { exportFullBackupJson } from "@/lib/fullBackupExport";

const MENU_ITEM_CLASS = "w-full justify-start whitespace-nowrap";

// 다른 메뉴 버튼과 배경·테두리는 똑같이 두고, 글자색만 빨간색으로 바꿔서 "위험한 작업
// 모음"이라는 걸 표시하는 트리거. !important로 강제하지 않으면 variant/active의 글자색이
// 이걸 덮어쓴다. 평소(흰 배경)엔 진한 빨강, 열렸을 때(진한 남색 배경)는 밝은 빨강을 써서
// 배경과의 대비를 유지한다.
function DangerMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <Button
        type="button"
        onClick={() => setOpen((v) => !v)}
        active={open}
        className={open ? "!text-red-300" : "!text-red-600"}
      >
        초기화/복원 {open ? "▴" : "▾"}
      </Button>
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="absolute right-0 top-full z-50 mt-1 flex min-w-max flex-col gap-1 rounded-lg border border-gray-200 bg-white p-1.5 shadow-lg animate-[popIn_150ms_ease-out]"
        >
          {children}
        </div>
      )}
    </div>
  );
}

export default function Header() {
  const { session, signOut, loading } = useAuth();
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

  const handleFullBackup = async () => {
    const { error } = await exportFullBackupJson();
    if (error) {
      window.alert(error);
      return;
    }
    showToast("다운로드 완료!");
  };

  return (
    <header className="sticky top-0 z-30 h-16 flex items-center justify-between px-4 py-3 border-b border-blue-950 bg-blue-900 shadow-md">
      <span className="font-semibold text-white">GMS 근무 스케줄</span>
      {!loading && (
        <div className="text-sm">
          {session ? (
            <div className="flex items-center gap-2 flex-wrap">
              <Button onClick={() => setUploadOpen(true)}>근무표 업로드</Button>
              <Button onClick={() => setPatternOpen(true)}>근무패턴 관리</Button>
              <Button onClick={() => setWeekendCompLeaveOpen(true)}>주말:대휴 연결</Button>
              <Button onClick={() => setManagerOpen(true)}>근무자 설정</Button>
              <Button onClick={() => setDefaultsOpen(true)}>근무시간 설정</Button>
              <Button onClick={() => setHolidayManagerOpen(true)}>공휴일 관리</Button>
              <Button onClick={() => setAuditLogOpen(true)}>변경 이력</Button>
              <Button
                onClick={handleFullBackup}
                title="직원/근무표/공휴일/공지사항/근무시간설정 등 DB 전체를 있는 그대로 JSON으로 백업해요"
              >
                JSON 백업
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
                  className={MENU_ITEM_CLASS}
                  onClick={() => setResetScheduleOpen(true)}
                >
                  기간 초기화
                </Button>
                {resetInfo?.canReset && (
                  <Button variant="danger" className={MENU_ITEM_CLASS} onClick={resetInfo.onReset}>
                    이번 달 초기화
                  </Button>
                )}
              </DangerMenu>
              <span className="text-blue-100 ml-1">{session.user.email}</span>
              <Button onClick={signOut}>로그아웃</Button>
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
      <ShiftDefaultsModal open={defaultsOpen} onClose={() => setDefaultsOpen(false)} />
      <FullRestoreModal open={restoreOpen} onClose={() => setRestoreOpen(false)} />
    </header>
  );
}
