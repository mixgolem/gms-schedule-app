"use client";

import { useState } from "react";
import { Employee, Shift, ShiftLeaveUsage, ShiftType, SHIFT_LABELS, SHIFT_COLORS } from "@/lib/types";
import { weekdayLabel } from "@/lib/dateUtils";
import { computeShiftDisplay } from "@/lib/shiftDisplay";
import { useGlobalLoading, useToast } from "@/app/providers";
import Button from "./ui/Button";

interface Props {
  date: string;
  employees: Employee[];
  shifts: Shift[];
  leaveUsages: ShiftLeaveUsage[];
  isHoliday: boolean;
  holidayName: string | null;
  canEdit: boolean;
  showColors: boolean; // 근무형태별 색상 표시 on/off (캘린더 표와 동일한 설정을 따른다)
  onToggleHoliday: (name: string | null) => Promise<void>;
  onRenameHoliday: (name: string | null) => Promise<void>;
  // 근무형태만 빠르게 바꿀 때 쓴다(시간·부분사용 등 세부조정은 근무편집에서). "unassigned"는
  // 그 날짜 근무 기록 자체를 지워서 미배정으로 되돌리는 것. 성공하면 true, 실패하면 false —
  // 여러 명을 한꺼번에 적용할 때 실패한 것만 대기 목록에 남겨두기 위해 필요하다.
  onQuickChangeShift: (employeeId: string, newType: ShiftType | "unassigned") => Promise<boolean>;
}

const GROUP_ORDER: ShiftType[] = ["dawn", "night", "day", "leave", "off"];

// 근무형태 빠른 변경 드롭다운에 쓰는 선택지. "연차"는 지금 앱에서 별도 shift_type으로
// 안 쓰는 레거시 값이라 뺀다(연차는 근무 중 부분사용으로 관리).
const QUICK_TYPE_OPTIONS: { value: ShiftType | "unassigned"; label: string }[] = [
  { value: "dawn", label: SHIFT_LABELS.dawn },
  { value: "day", label: SHIFT_LABELS.day },
  { value: "night", label: SHIFT_LABELS.night },
  { value: "leave", label: SHIFT_LABELS.leave },
  { value: "off", label: SHIFT_LABELS.off },
  { value: "unassigned", label: "미배정" },
];

export default function DayDetailPanel({
  date,
  employees,
  shifts,
  leaveUsages,
  isHoliday,
  holidayName,
  canEdit,
  showColors,
  onToggleHoliday,
  onRenameHoliday,
  onQuickChangeShift,
}: Props) {
  const [nameInput, setNameInput] = useState(holidayName ?? "");
  // 드롭다운을 바꿔도 바로 저장하지 않고, "변경사항 적용"을 눌러야 실제로 반영되도록
  // 대기 목록에 모아둔다 (employeeId -> 새로 고른 근무형태). 오클릭 방지용 안전장치.
  const [pending, setPending] = useState<Map<string, ShiftType | "unassigned">>(new Map());
  const [applying, setApplying] = useState(false);
  const { runWithLoading } = useGlobalLoading();
  const { showToast } = useToast();

  const shiftMap = new Map<string, Shift>();
  for (const s of shifts) {
    if (s.work_date === date) shiftMap.set(s.employee_id, s);
  }

  const leaveUsageMap = new Map<string, ShiftLeaveUsage[]>();
  for (const u of leaveUsages) {
    if (u.work_date !== date) continue;
    const arr = leaveUsageMap.get(u.employee_id) ?? [];
    arr.push(u);
    leaveUsageMap.set(u.employee_id, arr);
  }

  const unassigned = employees.filter((e) => !shiftMap.has(e.id));

  const currentTypeFor = (employeeId: string): ShiftType | "unassigned" =>
    shiftMap.get(employeeId)?.shift_type ?? "unassigned";

  const displayValueFor = (employeeId: string): ShiftType | "unassigned" =>
    pending.get(employeeId) ?? currentTypeFor(employeeId);

  const handleSelectChange = (employeeId: string, value: string) => {
    const newType = value === "unassigned" ? "unassigned" : (value as ShiftType);
    setPending((prev) => {
      const next = new Map(prev);
      if (newType === currentTypeFor(employeeId)) {
        next.delete(employeeId); // 원래 값으로 되돌리면 대기 목록에서 빠진다
      } else {
        next.set(employeeId, newType);
      }
      return next;
    });
  };

  const handleCancelPending = () => setPending(new Map());

  const handleApply = async () => {
    if (pending.size === 0) return;
    const changes = [...pending];
    setApplying(true);
    const failedIds = new Set<string>();
    await runWithLoading("변경사항 적용 중...", async () => {
      // 동시에 여러 요청을 한꺼번에 보내면 겹쳐서 부담이 크니(실시간 갱신까지 겹치면) 하나씩 순서대로.
      for (const [employeeId, newType] of changes) {
        const ok = await onQuickChangeShift(employeeId, newType);
        if (!ok) failedIds.add(employeeId);
      }
    });
    // 실패한 것만 대기 목록에 남겨서 다시 시도할 수 있게 하고, 성공한 것만 지운다.
    setPending((prev) => {
      const next = new Map(prev);
      for (const [employeeId] of changes) {
        if (!failedIds.has(employeeId)) next.delete(employeeId);
      }
      return next;
    });
    setApplying(false);

    if (failedIds.size === 0) {
      showToast(`${changes.length}건 변경 완료!`);
    } else {
      showToast(
        `${changes.length - failedIds.size}건 완료, ${failedIds.size}건 실패(대기 목록에 남아있어요)`,
        "error"
      );
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-lg font-bold text-black">
        {date} ({weekdayLabel(date)})
        {isHoliday && (
          <span className="text-red-700"> 공휴일{holidayName ? ` · ${holidayName}` : ""}</span>
        )}
      </p>

      <div className="space-y-2 border rounded-lg px-3 py-2 bg-gray-50">
        <label className="flex items-center gap-2 text-sm transition-colors duration-150 hover:bg-gray-100 -mx-1 px-1 rounded-md">
          <input
            type="checkbox"
            checked={isHoliday}
            disabled={!canEdit}
            onChange={() => onToggleHoliday(isHoliday ? null : nameInput.trim() || null)}
            className="accent-gray-900"
          />
          공휴일로 지정
        </label>
        <input
          type="text"
          value={nameInput}
          disabled={!canEdit}
          onChange={(e) => setNameInput(e.target.value)}
          onBlur={() => isHoliday && onRenameHoliday(nameInput.trim() || null)}
          onKeyDown={(e) => e.key === "Enter" && isHoliday && onRenameHoliday(nameInput.trim() || null)}
          placeholder="공휴일 이름 (예: 설날, 추석)"
          className="w-full border rounded-lg px-2 py-1 text-sm bg-white transition-shadow duration-150 focus:outline-none focus:ring-1 focus:ring-gray-300 disabled:opacity-50"
        />
      </div>

      <div className="space-y-3">
        {GROUP_ORDER.map((type) => {
          const members = employees.filter((e) => shiftMap.get(e.id)?.shift_type === type);
          return (
            <div key={type}>
              <p className="text-xs font-semibold text-black mb-1">
                {SHIFT_LABELS[type]} ({members.length}명)
              </p>
              {members.length === 0 ? (
                <p className="text-xs text-black">-</p>
              ) : (
                <ul className="space-y-1">
                  {members.map((e) => {
                    const shift = shiftMap.get(e.id) ?? null;
                    const isMain = shift?.is_main ?? false;
                    const usages = leaveUsageMap.get(e.id) ?? [];
                    const { timeLabel, usageDetails, isFullyOnLeave } = computeShiftDisplay(
                      shift,
                      usages
                    );

                    // 근무시간 전체를 연차/대휴/기타로 써서 실제로는 출근하지 않은 날은
                    // 대휴/휴무와 같은 회색으로 (캘린더 셀과 동일한 규칙).
                    const colorKey = isFullyOnLeave ? "off" : type;
                    const blockClass = showColors
                      ? SHIFT_COLORS[colorKey]
                          .split(" ")
                          .filter((c) => !c.startsWith("text-"))
                          .join(" ")
                      : "bg-white border-gray-200";
                    const isPending = pending.has(e.id);

                    return (
                      <li
                        key={e.id}
                        className={`rounded-lg border px-2 py-1.5 ${blockClass} ${
                          isPending ? "ring-2 ring-blue-400" : ""
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium text-black">{e.name}</span>
                          {isMain && (
                            <span title={type === "dawn" ? "새벽 메인당직" : "메인당직"}>
                              ★
                            </span>
                          )}
                          {timeLabel && (
                            <span className="text-xs text-black whitespace-nowrap">
                              {timeLabel}
                            </span>
                          )}
                          {canEdit && (
                            <select
                              value={displayValueFor(e.id)}
                              disabled={applying}
                              onChange={(ev) => handleSelectChange(e.id, ev.target.value)}
                              className="ml-auto text-xs border rounded-md px-1 py-0.5 bg-white disabled:opacity-50"
                            >
                              {QUICK_TYPE_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                        {usageDetails.length > 0 && (
                          <ul className="mt-1 space-y-0.5 border-t border-dashed border-gray-200 pt-1">
                            {usageDetails.map((u, i) => (
                              <li key={i} className="text-xs text-blue-900">
                                {u.label} · {u.start}~{u.end} ({u.hours}h)
                                {u.reason && ` — ${u.reason}`}
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}

        {unassigned.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-black mb-1">미배정</p>
            <ul className="space-y-1">
              {unassigned.map((e) => {
                const isPending = pending.has(e.id);
                return (
                  <li
                    key={e.id}
                    className={`flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2 py-1.5 ${
                      isPending ? "ring-2 ring-blue-400" : ""
                    }`}
                  >
                    <span className="text-sm text-black">{e.name}</span>
                    {canEdit && (
                      <select
                        value={pending.get(e.id) ?? ""}
                        disabled={applying}
                        onChange={(ev) => handleSelectChange(e.id, ev.target.value)}
                        className="ml-auto text-xs border rounded-md px-1 py-0.5 bg-white disabled:opacity-50"
                      >
                        <option value="" disabled>
                          배정...
                        </option>
                        {QUICK_TYPE_OPTIONS.filter((opt) => opt.value !== "unassigned").map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {pending.size > 0 && (
          <div className="sticky bottom-0 -mx-4 mt-2 flex items-center gap-2 border-t bg-white px-4 py-2">
            <span className="text-xs font-medium text-blue-900">변경 대기 {pending.size}건</span>
            <div className="ml-auto flex gap-2">
              <Button
                onClick={handleCancelPending}
                disabled={applying}
                className="text-xs px-2 py-1"
              >
                취소
              </Button>
              <Button
                variant="primary"
                onClick={handleApply}
                disabled={applying}
                className="text-xs px-3 py-1"
              >
                {applying ? "적용 중..." : "변경사항 적용"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
