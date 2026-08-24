"use client";

import { useEffect, useState } from "react";
import {
  Employee,
  Shift,
  ShiftType,
  SHIFT_LABELS,
  LeaveUsageInput,
  LeaveUsageType,
} from "@/lib/types";
import { ShiftDefaultsMap } from "@/lib/useShiftDefaults";
import { weekdayLabel } from "@/lib/dateUtils";
import { useSpecialNotes } from "@/lib/useSpecialNotes";
import { supabase } from "@/lib/supabaseClient";
import { validateSubRanges } from "@/lib/timeRanges";
import Button from "./ui/Button";
import TimeInput24 from "./ui/TimeInput24";

interface Props {
  employee: Employee;
  date: string;
  shift: Shift | null;
  canEdit: boolean;
  shiftDefaults: ShiftDefaultsMap;
  // 이 날짜가 이미 어떤 대휴의 "보상 원래근무일"로 연결돼 있다면 그 대휴 날짜 (없으면 null)
  linkedCompLeaveDate: string | null;
  onSave: (
    shiftType: ShiftType,
    isMain: boolean,
    startTime: string | null,
    endTime: string | null,
    leaveForDate: string | null,
    subEntries: LeaveUsageInput[]
  ) => Promise<void>;
  onDelete: () => Promise<void>;
  // 대휴 연결을 즉시 걸거나(leaveWorkDate가 이 대휴 날짜, workDate가 보상 원래근무일) 풀 때(workDate=null) 사용
  onSetCompLeaveLink: (leaveWorkDate: string, workDate: string | null) => Promise<void>;
  onClose: () => void;
}

const TYPES: ShiftType[] = ["dawn", "day", "night", "leave", "off"];

const USAGE_LABELS: Record<LeaveUsageType, string> = {
  annual: "연차",
  personal_leave: "본인 대휴",
  other: "기타",
};

function hasHours(type: ShiftType): type is "dawn" | "day" | "night" {
  return type === "dawn" || type === "day" || type === "night";
}

// 24:00은 시/분 드롭다운(00~23)으로 표현할 수 없어 다음날 00:00으로 대체
function timeForInput(value: string): string {
  return value === "24:00" ? "00:00" : value;
}

// 퇴근시간이 출근시간보다 같거나 빠르면 자정을 넘겨 다음날로 퇴근하는 근무형태
function crossesMidnight(start: string, end: string): boolean {
  return start !== "" && end !== "" && end <= start;
}

function defaultTimesFor(
  type: ShiftType,
  shiftDefaults: ShiftDefaultsMap
): { start: string; end: string } {
  if (type === "leave") return { start: "09:00", end: "18:00" };
  if (!hasHours(type)) return { start: "", end: "" };
  const d = shiftDefaults[type];
  return { start: timeForInput(d.start), end: timeForInput(d.end) };
}

let tempIdCounter = 0;
function nextTempId(): string {
  tempIdCounter += 1;
  return `temp-${tempIdCounter}`;
}

interface TimeRangeFieldsProps {
  startLabel: string;
  endLabel: string;
  start: string;
  end: string;
  canEdit: boolean;
  onStartChange: (v: string) => void;
  onEndChange: (v: string) => void;
}

function TimeRangeFields({
  startLabel,
  endLabel,
  start,
  end,
  canEdit,
  onStartChange,
  onEndChange,
}: TimeRangeFieldsProps) {
  return (
    <div className="flex items-center gap-3">
      <div>
        <label className="text-xs text-blue-900 block mb-0.5">{startLabel}</label>
        <TimeInput24 value={start} disabled={!canEdit} onChange={onStartChange} />
      </div>
      <div>
        <label className="text-xs text-blue-900 block mb-0.5">{endLabel}</label>
        <TimeInput24 value={end} disabled={!canEdit} onChange={onEndChange} />
      </div>
    </div>
  );
}

interface SubEntry {
  key: string;
  usageType: LeaveUsageType;
  hours: number;
  start: string;
  end: string;
  reason: string;
}

export default function EmployeeShiftEditor({
  employee,
  date,
  shift,
  canEdit,
  shiftDefaults,
  linkedCompLeaveDate,
  onSave,
  onDelete,
  onSetCompLeaveLink,
  onClose,
}: Props) {
  const initialType = shift?.shift_type ?? "day";
  const [type, setType] = useState<ShiftType>(initialType);
  const [isMain, setIsMain] = useState(shift?.is_main ?? false);
  const [start, setStart] = useState(
    shift?.start_time
      ? timeForInput(shift.start_time.slice(0, 5))
      : defaultTimesFor(initialType, shiftDefaults).start
  );
  const [end, setEnd] = useState(
    shift?.end_time
      ? timeForInput(shift.end_time.slice(0, 5))
      : defaultTimesFor(initialType, shiftDefaults).end
  );
  const [leaveForDate, setLeaveForDate] = useState(shift?.leave_for_date ?? "");
  const [subEntries, setSubEntries] = useState<SubEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkTargetDate, setLinkTargetDate] = useState(linkedCompLeaveDate ?? "");
  const [linking, setLinking] = useState(false);
  const [unlinkingLeave, setUnlinkingLeave] = useState(false);
  const [unlinkingWork, setUnlinkingWork] = useState(false);
  const { groups: specialNoteGroups } = useSpecialNotes();
  const myUnresolvedDates =
    specialNoteGroups.find((g) => g.employeeId === employee.id)?.dates ?? [];

  const shiftId = shift?.id;

  // 다른 브라우저에서 연결을 바꾸거나, 이 화면에서 직접 연결/해제한 뒤에도 입력칸이 최신
  // 연결 상태를 따라가도록 동기화 (사이드바를 닫지 않고 계속 편집하는 경우가 있어서 필요함)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLinkTargetDate(linkedCompLeaveDate ?? "");
  }, [linkedCompLeaveDate]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!shiftId) {
        setSubEntries([]);
        return;
      }
      const { data } = await supabase
        .from("shift_leave_usage")
        .select("*")
        .eq("shift_id", shiftId)
        .order("start_time");
      if (cancelled) return;
      setSubEntries(
        (data ?? []).map((d) => ({
          key: d.id,
          usageType: d.usage_type,
          hours: Number(d.hours),
          start: d.start_time.slice(0, 5),
          end: d.end_time.slice(0, 5),
          reason: d.reason ?? "",
        }))
      );
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [shiftId]);

  const handleTypeClick = (t: ShiftType) => {
    setType(t);
    setError(null);
    if (t !== "dawn" && t !== "night") setIsMain(false);
    if (!hasHours(t)) setSubEntries([]);
    const d = defaultTimesFor(t, shiftDefaults);
    setStart(d.start);
    setEnd(d.end);
  };

  const addSubEntry = (usageType: LeaveUsageType) => {
    setError(null);
    setSubEntries((prev) => [
      ...prev,
      { key: nextTempId(), usageType, hours: 8, start, end, reason: "" },
    ]);
  };

  const updateSubEntry = (key: string, patch: Partial<SubEntry>) => {
    setSubEntries((prev) => prev.map((e) => (e.key === key ? { ...e, ...patch } : e)));
  };

  const removeSubEntry = (key: string) => {
    setSubEntries((prev) => prev.filter((e) => e.key !== key));
  };

  const handleSave = async () => {
    setError(null);

    if (hasHours(type) && subEntries.length > 0) {
      const result = validateSubRanges(
        { start, end },
        subEntries.map((e) => ({ start: e.start, end: e.end, label: USAGE_LABELS[e.usageType] }))
      );
      if (!result.valid) {
        setError(result.error ?? "부분사용 시간을 확인해주세요");
        return;
      }
    }

    setSaving(true);
    await onSave(
      type,
      isMain,
      hasHours(type) ? start : null,
      hasHours(type) ? end : null,
      type === "leave" && leaveForDate ? leaveForDate : null,
      hasHours(type)
        ? subEntries.map((e) => ({
            usageType: e.usageType,
            hours: e.hours,
            start: e.start,
            end: e.end,
            reason: e.usageType === "other" ? e.reason.trim() || null : null,
          }))
        : []
    );
    setSaving(false);
    onClose();
  };

  const handleDelete = async () => {
    if (!window.confirm(`${date} ${employee.name}의 근무 기록을 삭제할까요? 되돌릴 수 없어요.`)) {
      return;
    }
    setDeleting(true);
    await onDelete();
    setDeleting(false);
  };

  // 대휴(leave) 날짜 쪽에서 연결 해제: 이 근무 기록(대휴) 자체의 보상 원래근무일을 즉시 비운다.
  const handleUnlinkFromLeaveSide = async () => {
    setUnlinkingLeave(true);
    await onSetCompLeaveLink(date, null);
    setLeaveForDate("");
    setUnlinkingLeave(false);
  };

  // 원래근무일(주말) 쪽에서 새 대휴 날짜로 연결
  const handleLinkFromWorkSide = async () => {
    if (!linkTargetDate) return;
    setLinking(true);
    await onSetCompLeaveLink(linkTargetDate, date);
    setLinking(false);
  };

  // 원래근무일(주말) 쪽에서 연결 해제
  const handleUnlinkFromWorkSide = async () => {
    if (!linkedCompLeaveDate) return;
    setUnlinkingWork(true);
    await onSetCompLeaveLink(linkedCompLeaveDate, null);
    setLinkTargetDate("");
    setUnlinkingWork(false);
  };

  const currentDefault = hasHours(type)
    ? { start: shiftDefaults[type].start, end: timeForInput(shiftDefaults[type].end) }
    : null;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-base font-semibold text-black">
          {date} ({weekdayLabel(date)})
        </p>
        <p className="text-lg font-bold text-black">{employee.name}</p>
      </div>

      <div>
        <p className="text-xs text-black mb-1">근무형태</p>
        <div className="grid grid-cols-5 gap-1">
          {TYPES.map((t) => (
            <Button
              key={t}
              disabled={!canEdit}
              onClick={() => handleTypeClick(t)}
              active={type === t}
              className="px-2 py-1.5"
            >
              {SHIFT_LABELS[t]}
            </Button>
          ))}
        </div>
      </div>

      {(type === "dawn" || type === "night") && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isMain}
            disabled={!canEdit}
            onChange={(e) => setIsMain(e.target.checked)}
            className="accent-gray-900"
          />
          메인당직으로 지정 (★)
        </label>
      )}

      {type === "leave" && (
        <div className="space-y-2">
          <div className="space-y-1">
            <label className="text-xs text-blue-900 block">이 대휴가 보상하는 날짜</label>
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={leaveForDate}
                disabled={!canEdit}
                onChange={(e) => setLeaveForDate(e.target.value)}
                className="flex-1 border rounded-lg px-2 py-1 text-sm transition-shadow duration-150 focus:outline-none focus:ring-1 focus:ring-gray-300"
              />
              {canEdit && shift?.leave_for_date && (
                <Button
                  variant="danger"
                  onClick={handleUnlinkFromLeaveSide}
                  disabled={unlinkingLeave}
                  className="text-xs px-2 py-1 shrink-0"
                >
                  {unlinkingLeave ? "해제 중..." : "연결 해제"}
                </Button>
              )}
            </div>
            <p className="text-[11px] text-black">
              날짜만 바꾸고 싶으면 입력 후 저장, 연결 자체를 끊고 싶으면 연결 해제를 눌러주세요
              (연결 해제는 저장 없이 바로 반영돼요)
            </p>
          </div>

          {myUnresolvedDates.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-black">대휴 미지정 근무일</p>
              <div className="flex flex-wrap gap-1">
                {myUnresolvedDates.map((d) => (
                  <Button
                    key={d}
                    disabled={!canEdit}
                    onClick={() => setLeaveForDate(d)}
                    active={leaveForDate === d}
                    className="text-xs px-2 py-1"
                  >
                    {Number(d.slice(5, 7))}/{Number(d.slice(8, 10))}({weekdayLabel(d)})
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {hasHours(type) && (
        <div className="space-y-1 border rounded-lg p-2 bg-gray-50">
          <label className="text-xs text-blue-900 block">연결된 대휴 사용일</label>
          {linkedCompLeaveDate ? (
            <div className="flex items-center gap-1.5">
              <span className="flex-1 text-sm text-black">
                {linkedCompLeaveDate} ({weekdayLabel(linkedCompLeaveDate)})
              </span>
              {canEdit && (
                <Button
                  variant="danger"
                  onClick={handleUnlinkFromWorkSide}
                  disabled={unlinkingWork}
                  className="text-xs px-2 py-1 shrink-0"
                >
                  {unlinkingWork ? "해제 중..." : "연결 해제"}
                </Button>
              )}
            </div>
          ) : (
            <p className="text-sm text-black">연결된 대휴 없음</p>
          )}
          {canEdit && (
            <div className="flex items-center gap-1.5 pt-1">
              <input
                type="date"
                value={linkTargetDate}
                onChange={(e) => setLinkTargetDate(e.target.value)}
                className="flex-1 border rounded-lg px-2 py-1 text-sm transition-shadow duration-150 focus:outline-none focus:ring-1 focus:ring-gray-300"
              />
              <Button
                onClick={handleLinkFromWorkSide}
                disabled={linking || !linkTargetDate}
                className="text-xs px-2 py-1 shrink-0"
              >
                {linking ? "연결 중..." : linkedCompLeaveDate ? "다른 날로 연결" : "연결"}
              </Button>
            </div>
          )}
          <p className="text-[11px] text-black">
            이 날짜를 보상해주는 대휴 날짜를 직접 지정하거나 풀 수 있어요 (그 날짜에 이미 대휴
            근무가 등록돼 있어야 해요, 저장 없이 바로 반영돼요)
          </p>
        </div>
      )}

      {hasHours(type) && currentDefault && (
        <div className="space-y-2">
          <p className="text-xs text-black">
            근무시간 · 기본 {currentDefault.start} ~{" "}
            {crossesMidnight(currentDefault.start, currentDefault.end) ? "익일 " : ""}
            {currentDefault.end}
          </p>
          <TimeRangeFields
            startLabel="출근"
            endLabel={`퇴근${crossesMidnight(start, end) ? " (익일)" : ""}`}
            start={start}
            end={end}
            canEdit={canEdit}
            onStartChange={setStart}
            onEndChange={setEnd}
          />
        </div>
      )}

      {hasHours(type) && (
        <div className="space-y-2">
          <p className="text-xs text-black">
            근무 중 부분 연차/대휴 사용 (기본 근무시간 안에서만 지정 가능)
          </p>

          {subEntries.length > 0 && (
            <div className="space-y-2">
              {subEntries.map((entry) => (
                <div key={entry.key} className="border rounded-lg p-2 space-y-2 bg-gray-50">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-black">
                      {USAGE_LABELS[entry.usageType]}
                    </span>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => removeSubEntry(entry.key)}
                        className="text-xs text-red-500 hover:text-red-700"
                      >
                        삭제
                      </button>
                    )}
                  </div>
                  <div>
                    <label className="text-xs text-blue-900 block mb-0.5">사용 시간</label>
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={entry.hours}
                      disabled={!canEdit}
                      onChange={(e) =>
                        updateSubEntry(entry.key, { hours: Number(e.target.value) })
                      }
                      className="w-full border rounded-lg px-2 py-1 text-sm transition-shadow duration-150 focus:outline-none focus:ring-1 focus:ring-gray-300"
                    />
                  </div>
                  <TimeRangeFields
                    startLabel={`${USAGE_LABELS[entry.usageType]} 시작시각`}
                    endLabel={`${USAGE_LABELS[entry.usageType]} 종료시각`}
                    start={entry.start}
                    end={entry.end}
                    canEdit={canEdit}
                    onStartChange={(v) => updateSubEntry(entry.key, { start: v })}
                    onEndChange={(v) => updateSubEntry(entry.key, { end: v })}
                  />
                  {entry.usageType === "other" && (
                    <div>
                      <label className="text-xs text-blue-900 block mb-0.5">
                        사유 (입력 안 해도 등록 가능)
                      </label>
                      <input
                        type="text"
                        value={entry.reason}
                        disabled={!canEdit}
                        onChange={(e) => updateSubEntry(entry.key, { reason: e.target.value })}
                        placeholder="예: 경조사, 병원 진료 등"
                        className="w-full border rounded-lg px-2 py-1 text-sm transition-shadow duration-150 focus:outline-none focus:ring-1 focus:ring-gray-300"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {canEdit && (
            <div className="flex gap-2">
              <Button onClick={() => addSubEntry("annual")} className="text-xs px-2 py-1">
                + 연차 사용
              </Button>
              <Button onClick={() => addSubEntry("personal_leave")} className="text-xs px-2 py-1">
                + 본인 대휴 사용
              </Button>
              <Button onClick={() => addSubEntry("other")} className="text-xs px-2 py-1">
                + 기타 사용
              </Button>
            </div>
          )}
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      {canEdit && (
        <div className="flex gap-2 pt-2">
          <Button variant="primary" onClick={handleSave} disabled={saving} className="flex-1 py-2">
            {saving ? "저장 중..." : "저장"}
          </Button>
          <Button onClick={onClose} className="py-2">
            취소
          </Button>
        </div>
      )}

      {canEdit && shift && (
        <Button
          variant="danger"
          onClick={handleDelete}
          disabled={deleting}
          className="w-full py-2"
        >
          {deleting ? "삭제 중..." : "근무 삭제"}
        </Button>
      )}
    </div>
  );
}
