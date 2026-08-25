"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
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
import { useAuth, useResetMonth, useGlobalLoading, useToast } from "./providers";
import { checkPairRule } from "@/lib/validation";
import { ShiftType, LeaveUsageInput } from "@/lib/types";
import { captureScheduleImage, downloadBlob, canShareFile, shareFile } from "@/lib/captureImage";
import { imageBlobToPdfBlob } from "@/lib/pdfExport";
import Button from "@/components/ui/Button";

type SidebarState =
  | { mode: "employee"; employeeId: string; date: string }
  | { mode: "day"; date: string }
  | null;

export default function Home() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const { session, loading: authLoading } = useAuth();
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
    setHolidayName,
    setCompLeaveLink,
    resetMonth,
  } = useSchedule(year, month);
  const { defaults: shiftDefaults } = useShiftDefaults();
  const { setInfo: setResetInfo } = useResetMonth();
  const { runWithLoading } = useGlobalLoading();
  const { showToast } = useToast();
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
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  const canEdit = !!session;
  const holidayDates = new Set(holidays.map((h) => h.work_date));
  const holidayNames = new Map(holidays.map((h) => [h.work_date, h.name]));

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
    showToast("저장 완료!");
  };

  const handleDeleteShift = async (employeeId: string, workDate: string) => {
    const { error } = await deleteShift(employeeId, workDate);
    if (error) {
      setWarning(`삭제 실패: ${error.message}`);
      return;
    }
    setSidebar(null);
    showToast("삭제 완료!");
  };

  // 일자 상세 패널에서 근무형태만 빠르게 바꿀 때 쓴다. handleSaveShift/handleDeleteShift와
  // 달리 사이드바를 닫지 않아서, 같은 날짜의 다른 직원을 이어서 바꿀 수 있다. 여러 명을
  // 한꺼번에 적용하는 배치 작업 중 일부만 실패할 수 있어서, 성공 여부를 boolean으로
  // 돌려줘 실패한 것만 대기 목록에 남겨둘 수 있게 한다(토스트는 배치 단위로 한 번만 띄움).
  const handleQuickChangeShift = async (
    employeeId: string,
    workDate: string,
    newType: ShiftType | "unassigned"
  ): Promise<boolean> => {
    if (newType === "unassigned") {
      const { error } = await deleteShift(employeeId, workDate);
      if (error) {
        setWarning(`삭제 실패: ${error.message}`);
        return false;
      }
      return true;
    }

    const hasHours = newType === "dawn" || newType === "day" || newType === "night";
    const startTime = hasHours ? shiftDefaults[newType].start : null;
    const endTime = hasHours
      ? shiftDefaults[newType].end === "24:00"
        ? "00:00"
        : shiftDefaults[newType].end
      : null;

    const { error, shifts: freshShifts } = await upsertShift(
      employeeId,
      workDate,
      newType,
      false,
      startTime,
      endTime,
      null
    );
    if (error) {
      const message =
        error.code === "23505"
          ? "이미 다른 대휴가 같은 날짜를 원래근무일로 쓰고 있어요."
          : error.message;
      setWarning(`저장 실패: ${message}`);
      return false;
    }

    // 근무형태가 바뀌면 기존 부분사용(연차/대휴 등) 항목은 더 이상 유효하지 않으니 비운다.
    const savedShift = freshShifts.find(
      (s) => s.employee_id === employeeId && s.work_date === workDate
    );
    if (savedShift) {
      await syncLeaveUsages(savedShift.id, employeeId, workDate, []);
    }

    const activeIds = new Set(employees.map((e) => e.id));
    const activeShifts = freshShifts.filter((s) => activeIds.has(s.employee_id));
    setWarning(checkPairRule(activeShifts, workDate, newType));
    return true;
  };

  const handleResetMonth = useCallback(() => {
    setResetConfirmOpen(true);
  }, []);

  const runResetMonth = useCallback(async () => {
    setResetConfirmOpen(false);
    await runWithLoading("이번 달 초기화 중...", async () => {
      const { error } = await resetMonth();
      setWarning(error ? `초기화 실패: ${error.message}` : null);
      if (!error) showToast("초기화 완료!");
    });
  }, [resetMonth, runWithLoading, showToast]);

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
    await runWithLoading("이미지 만드는 중...", async () => {
      const blob = await captureScheduleImage(calendarRef.current!, scheduleTitle, { banner: true });
      if (!blob) {
        showToast("이미지를 만들지 못했어요. 다시 시도해주세요.", "error");
        return;
      }
      const filename = `GMS_근무표_${year}년${month}월.png`;

      // 모바일은 클립보드 이미지 쓰기가 잘 안 통하는 경우가 많아, 공유 시트가 되면 그걸 우선 쓴다.
      const file = new File([blob], filename, { type: "image/png" });
      if (canShareFile(file)) {
        const { shared } = await shareFile(file, scheduleTitle);
        showToast(
          shared ? "이미지를 공유했어요" : "이미지 공유에 실패했어요. 다시 시도해주세요.",
          shared ? "success" : "error"
        );
        return;
      }

      // 캡처하는 동안(await) 개발자도구 등으로 포커스가 빠지면 클립보드 API가
      // "Document is not focused" 에러를 던진다 — 쓰기 직전에 포커스를 되돌려준다.
      window.focus();
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        showToast("이미지를 복사했어요");
      } catch {
        showToast("이미지 복사에 실패했어요. 페이지를 한 번 클릭한 뒤 다시 시도해주세요.", "error");
      }
    });
  };

  const handleDownloadImage = async () => {
    if (!calendarRef.current) return;
    await runWithLoading("이미지 만드는 중...", async () => {
      const blob = await captureScheduleImage(calendarRef.current!, scheduleTitle, { banner: true });
      if (!blob) {
        showToast("이미지를 만들지 못했어요. 다시 시도해주세요.", "error");
        return;
      }
      const filename = `GMS_근무표_${year}년${month}월.png`;

      // 모바일은 <a download>가 그냥 이미지를 열어버리기만 하는 경우가 많아, 공유 시트가
      // 되면 그걸 우선 쓴다(저장/공유를 사용자가 직접 고를 수 있어 더 확실하다).
      const file = new File([blob], filename, { type: "image/png" });
      if (canShareFile(file)) {
        const { shared } = await shareFile(file, scheduleTitle);
        showToast(
          shared ? "이미지를 저장했어요" : "이미지 저장에 실패했어요. 다시 시도해주세요.",
          shared ? "success" : "error"
        );
        return;
      }

      downloadBlob(blob, filename);
      showToast("이미지를 다운로드했어요");
    });
  };

  const handleOpenImageInNewTab = async () => {
    if (!calendarRef.current) return;
    // 캡처는 비동기라 그 뒤에 window.open을 부르면 팝업 차단에 걸릴 수 있어서,
    // 클릭 즉시(동기적으로) 빈 창부터 띄워두고 이미지가 준비되면 그 창에 연결한다.
    const win = window.open("", "_blank");
    await runWithLoading("이미지 만드는 중...", async () => {
      const blob = await captureScheduleImage(calendarRef.current!, scheduleTitle, { banner: true });
      if (!blob) {
        win?.close();
        showToast("이미지를 만들지 못했어요. 다시 시도해주세요.", "error");
        return;
      }
      if (!win) {
        showToast("팝업이 차단됐어요. 팝업 차단을 해제한 뒤 다시 시도해주세요.", "error");
        return;
      }
      win.location.href = URL.createObjectURL(blob);
      showToast("새 창에서 열었어요");
    });
  };

  const handleSavePdf = async () => {
    if (!calendarRef.current) return;
    await runWithLoading("PDF 만드는 중...", async () => {
      // 지금 화면에 보이는 그대로(이미지 복사/다운로드와 동일하게) 캡처한다.
      const blob = await captureScheduleImage(calendarRef.current!, scheduleTitle, { banner: true });
      if (!blob) {
        showToast("PDF를 만들지 못했어요. 다시 시도해주세요.", "error");
        return;
      }

      const pdfBlob = await imageBlobToPdfBlob(blob);
      const filename = `GMS_근무표_${year}년${month}월.pdf`;

      const file = new File([pdfBlob], filename, { type: "application/pdf" });
      if (canShareFile(file)) {
        const { shared } = await shareFile(file, scheduleTitle);
        showToast(
          shared ? "PDF를 공유했어요" : "PDF 공유에 실패했어요. 다시 시도해주세요.",
          shared ? "success" : "error"
        );
        return;
      }

      downloadBlob(pdfBlob, filename);
      showToast("PDF를 다운로드했어요");
    });
  };

  const activeEmployee =
    sidebar?.mode === "employee" ? employees.find((e) => e.id === sidebar.employeeId) : undefined;
  const activeShift =
    sidebar?.mode === "employee"
      ? shifts.find((s) => s.employee_id === sidebar.employeeId && s.work_date === sidebar.date) ??
        null
      : null;
  // 지금 편집 중인 날짜가 어떤 대휴의 "보상 원래근무일"로 이미 연결돼 있는지 (있다면 그 대휴 날짜)
  const activeLinkedCompLeaveDate =
    sidebar?.mode === "employee"
      ? shifts.find(
          (s) =>
            s.employee_id === sidebar.employeeId &&
            s.shift_type === "leave" &&
            s.leave_for_date === sidebar.date
        )?.work_date ?? null
      : null;

  // 대휴 연결을 근무편집 화면에서 직접 걸거나(workDate 지정) 풀 때(null) 쓰는 핸들러.
  // 근무편집 쪽(주말)에서 새 대휴 날짜로 연결하는 경우, 그 원래근무일을 이미 다른 대휴가
  // 찜하고 있으면 먼저 풀어줘야 유니크 제약(23505)에 걸리지 않는다.
  const handleSetCompLeaveLink = async (
    employeeId: string,
    leaveWorkDate: string,
    workDate: string | null
  ) => {
    if (workDate) {
      const conflicting = shifts.find(
        (s) =>
          s.employee_id === employeeId &&
          s.shift_type === "leave" &&
          s.leave_for_date === workDate &&
          s.work_date !== leaveWorkDate
      );
      if (conflicting) {
        const { error: clearError } = await setCompLeaveLink(employeeId, conflicting.work_date, null);
        if (clearError) {
          setWarning(`대휴 연결 실패: ${clearError.message}`);
          return;
        }
      }
    }

    const { error } = await setCompLeaveLink(employeeId, leaveWorkDate, workDate);
    if (error) {
      setWarning(`대휴 연결 실패: ${error.message}`);
      return;
    }
    showToast(workDate ? "연결 완료!" : "연결 해제 완료!");
  };

  // 로그인 여부를 확인하는 동안은 아무것도 보여주지 않는다(비로그인 화면이 잠깐
  // 깜빡였다 사라지는 걸 막기 위해).
  if (authLoading) {
    return (
      <main className="p-4 max-w-[1900px] mx-auto w-full flex items-center justify-center min-h-[50vh]">
        <div className="flex items-center gap-2 text-sm text-black">
          <div className="h-4 w-4 rounded-full border-2 border-gray-200 border-t-blue-900 animate-spin" />
          확인 중...
        </div>
      </main>
    );
  }

  // 근무표는 로그인한 사용자만 조회할 수 있다. RLS도 같이 authenticated 전용으로
  // 막아뒀으니(마이그레이션 018), 여기서는 UI만 안내로 대체한다.
  if (!session) {
    return (
      <main className="p-4 max-w-[1900px] mx-auto w-full flex items-center justify-center min-h-[50vh]">
        <div className="text-center space-y-3">
          <p className="text-sm text-black">로그인해야 근무표를 볼 수 있어요.</p>
          <Link
            href="/login"
            className="inline-flex items-center rounded-lg border border-blue-900 bg-white px-4 py-2 text-sm font-medium text-blue-900 transition-all duration-150 ease-out hover:-translate-y-0.5 hover:bg-blue-50 hover:shadow-sm active:translate-y-0"
          >
            로그인하러 가기
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="p-4 max-w-[1900px] mx-auto w-full space-y-4">
      <div className="sticky top-16 z-20 h-14 bg-gray-50 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2">
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
            🖥ERP엑셀 다운로드
          </Button>
          <Button onClick={handleCopyImage}>🖼️이미지 복사</Button>
          <Button onClick={handleDownloadImage}>🖼️이미지 다운로드</Button>
          <Button onClick={handleOpenImageInNewTab}>🔗(모바일)이미지 새 창에서 열기</Button>
          <Button onClick={handleSavePdf}>🖨PDF 저장</Button>
        </div>
      </div>

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
        <div className="w-full md:w-36 shrink-0 space-y-3 md:sticky md:top-[120px] md:self-start">
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
            <div className="flex items-center gap-2 text-sm text-black py-8 justify-center">
              <div className="h-4 w-4 rounded-full border-2 border-gray-200 border-t-blue-900 animate-spin" />
              불러오는 중...
            </div>
          ) : (
            <div ref={calendarRef}>
              <CalendarGrid
                employees={employees}
                shifts={shifts}
                leaveUsages={leaveUsages}
                holidayDates={holidayDates}
                holidayNames={holidayNames}
                weeks={weeks}
                canEdit={canEdit}
                showColors={showColors}
                filterEmployeeIds={filterEmployeeIds}
                filterMode={filterMode}
                sortMode={sortMode}
                onCellClick={(employeeId, date) => setSidebar({ mode: "employee", employeeId, date })}
                onDateClick={(date) => setSidebar({ mode: "day", date })}
              />
            </div>
          )}

          <div className="flex gap-4 text-xs text-black pt-2 flex-wrap">
            <span className="text-blue-900 font-bold">테두리 강조 = 오늘</span>
            <span>★ = 메인당직</span>
            <span className="text-red-800 font-bold">빨간 글자 = 2인1조 미충족</span>
            <span className="text-red-700 bg-red-50 border-2 border-red-400 rounded px-1 font-bold">
              ⚠️ 빨간 테두리 칸 = 연속 7일 이상 근무 / 야간→새벽 연속
            </span>
            <span className="text-black">(셀에 마우스를 올리면 사유 출력)</span>
            <span className="text-sky-600">토요일</span>
            <span className="text-red-400">일요일</span>
            <span className="text-red-600">공휴일</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <SpecialNotesTable year={year} />
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
            employees={employees}
            shifts={shifts}
            leaveUsages={leaveUsages}
            linkedCompLeaveDate={activeLinkedCompLeaveDate}
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
            onSetCompLeaveLink={(leaveWorkDate, workDate) =>
              handleSetCompLeaveLink(sidebar.employeeId, leaveWorkDate, workDate)
            }
            onClose={() => setSidebar(null)}
          />
        )}
        {sidebar?.mode === "day" && (
          <DayDetailPanel
            key={sidebar.date}
            date={sidebar.date}
            employees={employees}
            shifts={shifts}
            leaveUsages={leaveUsages}
            isHoliday={holidayDates.has(sidebar.date)}
            holidayName={holidayNames.get(sidebar.date) ?? null}
            canEdit={canEdit}
            showColors={showColors}
            onToggleHoliday={async (name) => {
              await toggleHoliday(sidebar.date, name);
              showToast("변경 완료!");
            }}
            onRenameHoliday={async (name) => {
              await setHolidayName(sidebar.date, name);
              showToast("변경 완료!");
            }}
            onQuickChangeShift={(employeeId, newType) =>
              handleQuickChangeShift(employeeId, sidebar.date, newType)
            }
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
