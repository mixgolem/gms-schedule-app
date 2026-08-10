"use client";

import { useRef, useState } from "react";
import MonthPicker from "@/components/MonthPicker";
import CalendarGrid from "@/components/CalendarGrid";
import EmployeeFilter from "@/components/EmployeeFilter";
import NoticeBox from "@/components/NoticeBox";
import SpecialNotesTable from "@/components/SpecialNotesTable";
import CompLeaveTable from "@/components/CompLeaveTable";
import AnnualLeaveTable from "@/components/AnnualLeaveTable";
import MonthlyStatsTable from "@/components/MonthlyStatsTable";
import ShiftSidebar from "@/components/ShiftSidebar";
import EmployeeShiftEditor from "@/components/EmployeeShiftEditor";
import DayDetailPanel from "@/components/DayDetailPanel";
import { useSchedule } from "@/lib/useSchedule";
import { useShiftDefaults } from "@/lib/useShiftDefaults";
import { useAuth } from "./providers";
import { checkPairRule } from "@/lib/validation";
import { ShiftType, LeaveUsageInput } from "@/lib/types";
import { exportScheduleToExcel } from "@/lib/scheduleExport";
import { captureNodeAsBlob, downloadBlob } from "@/lib/captureImage";
import Button from "@/components/ui/Button";

type SidebarState =
  | { mode: "employee"; employeeId: string; date: string }
  | { mode: "day"; date: string }
  | null;

type SortMode = "default" | "byShiftType";

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
    syncLeaveUsages,
    toggleHoliday,
    resetMonth,
  } = useSchedule(year, month);
  const { defaults: shiftDefaults } = useShiftDefaults();
  const [warning, setWarning] = useState<string | null>(null);
  const [sidebar, setSidebar] = useState<SidebarState>(null);
  const [showColors, setShowColors] = useState(false);
  const [filterEmployeeId, setFilterEmployeeId] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("default");
  const calendarRef = useRef<HTMLDivElement>(null);

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
      setWarning(`저장 실패: ${error.message}`);
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

  const handleResetMonth = async () => {
    const ok = window.confirm(
      `${year}년 ${month}월 근무표를 전부 초기화할까요? 직원 목록은 그대로 남고, 이 달의 근무 기록만 삭제되며 되돌릴 수 없어요.`
    );
    if (!ok) return;

    const { error } = await resetMonth();
    setWarning(error ? `초기화 실패: ${error.message}` : null);
  };

  const handleExportExcel = () => {
    exportScheduleToExcel(year, month, employees, shifts, filterEmployeeId);
  };

  const handleCopyImage = async () => {
    if (!calendarRef.current) return;
    const blob = await captureNodeAsBlob(calendarRef.current);
    if (!blob) return;
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
  };

  const handleDownloadImage = async () => {
    if (!calendarRef.current) return;
    const blob = await captureNodeAsBlob(calendarRef.current);
    if (!blob) return;
    downloadBlob(blob, `GMS_근무표_${year}년${month}월.png`);
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
          <Button onClick={() => setShowColors((v) => !v)} active={showColors}>
            근무 색상 {showColors ? "ON" : "OFF"}
          </Button>
          <Button onClick={handleExportExcel}>엑셀 다운로드</Button>
          <Button onClick={handleCopyImage}>이미지 복사</Button>
          <Button onClick={handleDownloadImage}>이미지 다운로드</Button>
          {canEdit && (
            <Button variant="danger" onClick={handleResetMonth}>
              이번 달 초기화
            </Button>
          )}
        </div>
      </div>
      {!canEdit && (
        <p className="text-xs text-gray-400 -mt-2">조회 전용입니다. 로그인하면 편집할 수 있어요.</p>
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
        <div className="w-full md:w-36 shrink-0 space-y-3">
          <EmployeeFilter
            employees={employees}
            selectedId={filterEmployeeId}
            onSelect={setFilterEmployeeId}
          />
          <Button
            onClick={() => setSortMode((m) => (m === "default" ? "byShiftType" : "default"))}
            active={sortMode === "byShiftType"}
            className="w-full justify-center"
          >
            {sortMode === "byShiftType" ? "시간대 정렬" : "기본 정렬"}
          </Button>
          <NoticeBox canEdit={canEdit} />
        </div>

        <div className="flex-1 min-w-0 space-y-3">
          {loading ? (
            <p className="text-sm text-gray-400">불러오는 중...</p>
          ) : (
            <div ref={calendarRef}>
              <CalendarGrid
                employees={employees}
                shifts={shifts}
                leaveUsages={leaveUsages}
                holidayDates={holidayDates}
                weeks={weeks}
                canEdit={canEdit}
                showColors={showColors}
                filterEmployeeId={filterEmployeeId}
                sortMode={sortMode}
                onCellClick={(employeeId, date) => setSidebar({ mode: "employee", employeeId, date })}
                onDateClick={(date) => setSidebar({ mode: "day", date })}
              />
            </div>
          )}

          <div className="flex gap-4 text-xs text-gray-500 pt-2 flex-wrap">
            <span>☆ = 새벽 메인당직 · ★ = 야간 메인당직</span>
            <span className="text-red-500">빨간칸 = 새벽/야간 2인1조 미충족</span>
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
    </main>
  );
}
