"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import MonthPicker from "@/components/MonthPicker";
import CalendarGrid from "@/components/CalendarGrid";
import EmployeeFilter, { EmployeeFilterMode } from "@/components/EmployeeFilter";
import NoticeBox from "@/components/NoticeBox";
import SpecialNotesTable from "@/components/SpecialNotesTable";
import CompLeaveTable from "@/components/CompLeaveTable";
import AnnualLeaveTable from "@/components/AnnualLeaveTable";
import MonthlyStatsTable from "@/components/MonthlyStatsTable";
import ShiftSidebar from "@/components/ShiftSidebar";
import EmployeeShiftEditor from "@/components/EmployeeShiftEditor";
import DayDetailPanel from "@/components/DayDetailPanel";
import ErpExportModal from "@/components/ErpExportModal";
import ConfirmPhraseDialog from "@/components/ConfirmPhraseDialog";
import { useSchedule } from "@/lib/useSchedule";
import { useShiftDefaults } from "@/lib/useShiftDefaults";
import { useUserPreferences } from "@/lib/useUserPreferences";
import { useAuth, useResetMonth, useGlobalLoading } from "./providers";
import { checkPairRule } from "@/lib/validation";
import { ShiftType, LeaveUsageInput } from "@/lib/types";
import { captureScheduleImage, downloadBlob } from "@/lib/captureImage";
import Button from "@/components/ui/Button";

type SidebarState =
  | { mode: "employee"; employeeId: string; date: string }
  | { mode: "day"; date: string }
  | null;

export default function Home() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const { session } = useAuth();
  const {
    employees,
    shifts,
    holidays,
    leaveUsages,
    weeks,
    loading,
    upsertShift,
    deleteShift,
    syncLeaveUsages,
    toggleHoliday,
    resetMonth,
  } = useSchedule(year, month);
  const { defaults: shiftDefaults } = useShiftDefaults();
  const { setInfo: setResetInfo } = useResetMonth();
  const { runWithLoading } = useGlobalLoading();
  const {
    showColors,
    setShowColors,
    sortMode,
    setSortMode,
    error: preferencesError,
  } = useUserPreferences();
  const [warning, setWarning] = useState<string | null>(null);
  const [sidebar, setSidebar] = useState<SidebarState>(null);
  const [filterEmployeeIds, setFilterEmployeeIds] = useState<string[]>([]);
  const [filterMode, setFilterMode] = useState<EmployeeFilterMode>("highlight");
  const [erpExportOpen, setErpExportOpen] = useState(false);
  const calendarRef = useRef<HTMLDivElement>(null);
  const [printMode, setPrintMode] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  const canEdit = !!session;
  const holidayDates = new Set(holidays.map((h) => h.work_date));

  const handleSaveShift = async (
    employeeId: string,
    workDate: string,
    shiftType: ShiftType,
    isMain: boolean,
    startTime: string | null,
    endTime: string | null,
    leaveForDate: string | null,
    subEntries: LeaveUsageInput[]
  ) => {
    const { error, shifts: freshShifts } = await upsertShift(
      employeeId,
      workDate,
      shiftType,
      isMain,
      startTime,
      endTime,
      leaveForDate
    );

    if (error) {
      const message =
        error.code === "23505"
          ? "이미 다른 대휴가 같은 날짜를 원래근무일로 쓰고 있어요. 다른 날짜를 선택해주세요."
          : error.message;
      setWarning(`저장 실패: ${message}`);
      return;
    }

    const savedShift = freshShifts.find(
      (s) => s.employee_id === employeeId && s.work_date === workDate
    );
    if (savedShift) {
      const { error: usageError } = await syncLeaveUsages(
        savedShift.id,
        employeeId,
        workDate,
        subEntries
      );
      if (usageError) {
        setWarning(`부분사용 저장 실패: ${usageError.message}`);
        return;
      }
    }

    // 2인1조 경고는 화면에 보이는(활성) 직원 기준으로만 판단
    const activeIds = new Set(employees.map((e) => e.id));
    const activeShifts = freshShifts.filter((s) => activeIds.has(s.employee_id));
    setWarning(checkPairRule(activeShifts, workDate, shiftType));
  };

  const handleDeleteShift = async (employeeId: string, workDate: string) => {
    const { error } = await deleteShift(employeeId, workDate);
    if (error) {
      setWarning(`삭제 실패: ${error.message}`);
      return;
    }
    setSidebar(null);
  };

  const handleResetMonth = useCallback(() => {
    setResetConfirmOpen(true);
  }, []);

  const runResetMonth = useCallback(async () => {
    setResetConfirmOpen(false);
    await runWithLoading("이번 달 초기화 중...", async () => {
      const { error } = await resetMonth();
      setWarning(error ? `초기화 실패: ${error.message}` : null);
    });
  }, [resetMonth, runWithLoading]);

  // Header에서 "이번 달 초기화" 버튼을 띄울 수 있도록 현재 연/월과 초기화 함수를 공유 슬롯에 등록
  useEffect(() => {
    setResetInfo({ year, month, canReset: canEdit, onReset: handleResetMonth });
    return () => setResetInfo(null);
  }, [year, month, canEdit, handleResetMonth, setResetInfo]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (preferencesError) setWarning(preferencesError);
  }, [preferencesError]);

  const scheduleTitle = `${year}년 ${month}월 GMS 근무스케줄`;

  const handleCopyImage = async () => {
    if (!calendarRef.current) return;
    const blob = await captureScheduleImage(calendarRef.current, scheduleTitle);
    if (!blob) return;
    // 캡처하는 동안(await) 개발자도구 등으로 포커스가 빠지면 클립보드 API가
    // "Document is not focused" 에러를 던진다 — 쓰기 직전에 포커스를 되돌려준다.
    window.focus();
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    } catch {
      setWarning("이미지 복사에 실패했어요. 페이지를 한 번 클릭한 뒤 다시 시도해주세요.");
    }
  };

  const handleDownloadImage = async () => {
    if (!calendarRef.current) return;
    const blob = await captureScheduleImage(calendarRef.current, scheduleTitle);
    if (!blob) return;
    downloadBlob(blob, `GMS_근무표_${year}년${month}월.png`);
  };

  const handlePrint = async () => {
    if (!calendarRef.current) return;
    // 새 창은 클릭 시점에 바로 열어야 팝업 차단을 안 당한다 (async 이후엔 사용자 제스처가 사라짐)
    const printWindow = window.open("", "_blank", "width=1200,height=800");
    if (!printWindow) return;

    // 인쇄는 화면 설정과 무관하게 항상 기본 정렬 + 색상 OFF로 고정해서 캡처한다.
    // 화면 밖에 별도로 렌더링해서 캡처하면 라이브러리가 빈 이미지를 만드는 경우가 있어서,
    // 실제 보이는 캘린더 자체를 잠깐 강제 설정으로 바꿨다가 캡처 후 되돌리는 방식을 쓴다.
    setPrintMode(true);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    let blob: Blob | null = null;
    try {
      blob = await captureScheduleImage(calendarRef.current, scheduleTitle);
    } finally {
      setPrintMode(false);
    }

    if (!blob) {
      printWindow.close();
      setWarning("인쇄용 이미지를 만들지 못했어요. 다시 시도해주세요.");
      return;
    }
    const url = URL.createObjectURL(blob);

    printWindow.document.open();
    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
<title>${scheduleTitle}</title>
<style>
  @page { size: landscape; margin: 0; }
  html, body { height: 100%; margin: 0; }
  body { display: flex; align-items: center; justify-content: center; }
  img { max-width: 100%; max-height: 100vh; object-fit: contain; }
</style>
</head>
<body>
<img id="cal" src="${url}" />
<script>
  var img = document.getElementById('cal');
  function doPrint() { window.focus(); window.print(); }
  if (img.complete) { doPrint(); } else { img.onload = doPrint; }
  window.onafterprint = function () { window.close(); };
</script>
</body>
</html>`);
    printWindow.document.close();
  };

  const activeEmployee =
    sidebar?.mode === "employee" ? employees.find((e) => e.id === sidebar.employeeId) : undefined;
  const activeShift =
    sidebar?.mode === "employee"
      ? shifts.find((s) => s.employee_id === sidebar.employeeId && s.work_date === sidebar.date) ??
        null
      : null;

  return (
    <main className="p-4 max-w-[1900px] mx-auto w-full space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <MonthPicker
          year={year}
          month={month}
          onChange={(y, m) => {
            setYear(y);
            setMonth(m);
          }}
        />
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            onClick={() => setErpExportOpen(true)}
            title="선택한 근무자의 한 달치 근무를 ERP 업로드 양식 그대로 내보내요"
          >
            ERP엑셀 다운로드
          </Button>
          <Button onClick={handleCopyImage}>이미지 복사</Button>
          <Button onClick={handleDownloadImage}>이미지 다운로드</Button>
          <Button onClick={handlePrint}>인쇄</Button>
        </div>
      </div>
      {!canEdit && (
        <p className="text-xs text-gray-600 -mt-2">조회 전용입니다. 로그인하면 편집할 수 있어요.</p>
      )}

      {warning && (
        <div className="bg-amber-50 border border-amber-300 text-amber-800 text-sm rounded-lg px-3 py-2 flex justify-between items-center animate-[popIn_150ms_ease-out]">
          <span>⚠️ {warning}</span>
          <button
            onClick={() => setWarning(null)}
            className="text-amber-500 rounded-md p-1 ml-3 transition-all duration-150 hover:text-amber-700 hover:bg-amber-100 hover:scale-110"
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex gap-4 items-start flex-col md:flex-row">
        <div className="w-full md:w-36 shrink-0 space-y-3 md:sticky md:top-4 md:self-start">
          <EmployeeFilter
            employees={employees}
            selectedIds={filterEmployeeIds}
            mode={filterMode}
            onSelect={(ids, mode) => {
              setFilterEmployeeIds(ids);
              setFilterMode(mode);
            }}
          />
          <Button
            onClick={() => setShowColors(!showColors)}
            active={showColors}
            className="w-full justify-center"
          >
            근무 색상 {showColors ? "ON" : "OFF"}
          </Button>
          <Button
            onClick={() => setSortMode(sortMode === "default" ? "byShiftType" : "default")}
            active={sortMode === "byShiftType"}
            className="w-full justify-center"
          >
            {sortMode === "byShiftType" ? "시간대 정렬" : "기본 정렬"}
          </Button>
          <NoticeBox canEdit={canEdit} />
        </div>

        <div className="flex-1 min-w-0 space-y-3">
          {loading ? (
            <p className="text-sm text-gray-600">불러오는 중...</p>
          ) : (
            <div ref={calendarRef} className={printMode ? "print-capturing" : undefined}>
              <CalendarGrid
                employees={employees}
                shifts={shifts}
                leaveUsages={leaveUsages}
                holidayDates={holidayDates}
                weeks={weeks}
                canEdit={printMode ? false : canEdit}
                showColors={printMode ? false : showColors}
                filterEmployeeIds={filterEmployeeIds}
                filterMode={filterMode}
                sortMode={printMode ? "default" : sortMode}
                onCellClick={(employeeId, date) => setSidebar({ mode: "employee", employeeId, date })}
                onDateClick={(date) => setSidebar({ mode: "day", date })}
              />
            </div>
          )}

          <div className="flex gap-4 text-xs text-gray-500 pt-2 flex-wrap">
            <span className="text-blue-900 font-bold">테두리 강조 = 오늘</span>
            <span>★ = 메인당직</span>
            <span className="text-red-800 font-bold">빨간 글자 = 새벽/야간 2인1조 미충족</span>
            <span className="text-sky-600">토요일</span>
            <span className="text-red-400">일요일</span>
            <span className="text-red-600">공휴일</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <SpecialNotesTable />
            <AnnualLeaveTable year={year} month={month} canEdit={canEdit} />
          </div>
          <CompLeaveTable year={year} month={month} canEdit={canEdit} />
          <MonthlyStatsTable
            year={year}
            month={month}
            employees={employees}
            shifts={shifts}
            leaveUsages={leaveUsages}
          />
        </div>
      </div>

      <ShiftSidebar
        open={sidebar !== null}
        title={sidebar?.mode === "day" ? "일자 상세" : "근무 편집"}
        onClose={() => setSidebar(null)}
      >
        {sidebar?.mode === "employee" && activeEmployee && (
          <EmployeeShiftEditor
            key={`${sidebar.employeeId}_${sidebar.date}`}
            employee={activeEmployee}
            date={sidebar.date}
            shift={activeShift}
            canEdit={canEdit}
            shiftDefaults={shiftDefaults}
            onSave={(shiftType, isMain, startTime, endTime, leaveForDate, subEntries) =>
              handleSaveShift(
                sidebar.employeeId,
                sidebar.date,
                shiftType,
                isMain,
                startTime,
                endTime,
                leaveForDate,
                subEntries
              )
            }
            onDelete={() => handleDeleteShift(sidebar.employeeId, sidebar.date)}
            onClose={() => setSidebar(null)}
          />
        )}
        {sidebar?.mode === "day" && (
          <DayDetailPanel
            date={sidebar.date}
            employees={employees}
            shifts={shifts}
            leaveUsages={leaveUsages}
            isHoliday={holidayDates.has(sidebar.date)}
            canEdit={canEdit}
            onToggleHoliday={() => toggleHoliday(sidebar.date)}
          />
        )}
      </ShiftSidebar>

      <ErpExportModal
        open={erpExportOpen}
        employees={employees}
        year={year}
        month={month}
        shifts={shifts}
        holidayDates={holidayDates}
        shiftDefaults={shiftDefaults}
        onClose={() => setErpExportOpen(false)}
      />

      <ConfirmPhraseDialog
        open={resetConfirmOpen}
        title={`${year}년 ${month}월 근무표 초기화`}
        message="직원 목록은 그대로 남고, 이 달의 근무 기록만 삭제되며 되돌릴 수 없어요."
        phrase="근무표초기화"
        danger
        onConfirm={runResetMonth}
        onCancel={() => setResetConfirmOpen(false)}
      />
    </main>
  );
}
