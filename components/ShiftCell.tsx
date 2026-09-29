"use client";

import { Shift, ShiftLeaveUsage, SHIFT_LABELS, SHIFT_COLORS } from "@/lib/types";
import { computeShiftDisplay, UsageDetail } from "@/lib/shiftDisplay";
import { TimeAxis, computeShiftTimeBar, computeAxisTicks, isTimedLeave } from "@/lib/timeBar";

interface Props {
  employeeName: string;
  shift: Shift | null;
  leaveUsages: ShiftLeaveUsage[];
  compLeaveDate?: string | null; // 이 근무일을 보상하는 대휴의 날짜(있으면 역방향으로 표시)
  invalidReason?: string | null; // 2인1조 미충족, 대휴-공휴일 매핑 등 문제 있으면 사유 문구, 빨간색으로 경고 표시
  // 연속 7일 이상 근무, 야간→새벽 연속처럼 근무자 건강에 직접 영향을 주는 심각한 문제는
  // 2인1조 미충족 같은 일반 경고보다 눈에 더 띄게(칸 전체를 빨갛게) 표시한다.
  severeInvalid?: boolean;
  showColors: boolean; // 근무형태별 색상 표시 on/off
  // 있으면 "시간 막대" 보기: 한 줄을 [이름 | 축 전체 막대]로 나누고 근무 시간대만 칠한다.
  timeAxis?: TimeAxis | null;
  onClick: () => void;
}

// 근무 중 연차/대휴로 뺀 시간은 달력에서 대휴·휴무에 쓰는 회색 그대로 칠한다.
const USAGE_FILL_CLASS = SHIFT_COLORS.leave.split(" ").find((c) => c.startsWith("bg-")) ?? "";

export default function ShiftCell({
  employeeName,
  shift,
  leaveUsages,
  compLeaveDate,
  invalidReason,
  severeInvalid,
  showColors,
  timeAxis,
  onClick,
}: Props) {
  const current = shift?.shift_type ?? null;
  const isMain = shift?.is_main ?? false;
  const invalid = !!invalidReason;
  const severe = !!severeInvalid;
  // 대휴인데 원래근무일이 아직 지정 안 된 경우 - 파란 글자로 눈에 띄게 표시
  const unassignedLeave = current === "leave" && !shift?.leave_for_date;

  const { timeLabel, usageSuffix, usageDetails, isFullyOnLeave } = computeShiftDisplay(
    shift,
    leaveUsages
  );

  if (timeAxis) {
    return (
      <TimeBarCell
        employeeName={employeeName}
        shift={shift}
        leaveUsages={leaveUsages}
        compLeaveDate={compLeaveDate}
        invalidReason={invalidReason}
        severe={severe}
        unassignedLeave={unassignedLeave}
        showColors={showColors}
        timeAxis={timeAxis}
        timeLabel={timeLabel}
        usageSuffix={usageSuffix}
        usageDetails={usageDetails}
        isFullyOnLeave={isFullyOnLeave}
        onClick={onClick}
      />
    );
  }

  // 근무시간 전체를 연차/대휴/기타로 써서 실제로는 출근하지 않은 날은 대휴/휴무와 같은
  // 회색으로 보이게 하고, 일부만 쓴 경우(반차/시차 등)는 평소 근무형태 색을 그대로 쓴다.
  const colorKey = isFullyOnLeave ? "off" : current;

  // 배경/테두리는 근무형태별 색을 그대로 쓰되, 글자색은 항상 검은색으로 고정한다
  // (2인1조 미충족 등 문제가 있을 때만 예외로 진한 빨간색으로 강조).
  const bgBorderClass = !colorKey
    ? "bg-white border-gray-200"
    : showColors
    ? SHIFT_COLORS[colorKey]
        .split(" ")
        .filter((c) => !c.startsWith("text-"))
        .join(" ")
    : "bg-white border-gray-200";
  // 근무 색상 표시가 꺼져 있으면 경고 강조(빨강/파랑)도 함께 끈다 — 색을 아예 안 보이게
  // 하고 싶어서 끈 건데 경고색만 남아있으면 그 의도와 어긋난다.
  const showSevere = severe && showColors;
  const showInvalid = invalid && showColors;
  const showUnassignedLeave = unassignedLeave && showColors;

  const colorClass = showSevere
    ? "bg-red-50 border-2 border-red-400 text-red-700 font-extrabold"
    : showInvalid
    ? `${bgBorderClass} text-red-800 font-bold`
    : showUnassignedLeave
    ? `${bgBorderClass} text-blue-600 font-bold`
    : `${bgBorderClass} text-black`;

  const isWhiteBg = !current || !showColors;
  const hoverClass = showSevere ? "hover:bg-red-100" : isWhiteBg ? "hover:bg-gray-100" : "hover:brightness-95";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs whitespace-nowrap transition-all duration-150 ease-out cursor-pointer hover:shadow-sm hover:-translate-y-0.5 ${hoverClass} active:translate-y-0 active:shadow-none ${colorClass}`}
      title={invalidReason ?? (unassignedLeave ? "대휴 원래근무일이 아직 지정 안 됐어요" : undefined)}
    >
      {showSevere && <span aria-hidden>⚠️</span>}
      <span className="font-bold text-[13px]">{employeeName}</span>
      {timeLabel && <span className="font-medium">{timeLabel}</span>}
      {compLeaveDate && (
        <span
          className="text-[10px] text-blue-700 font-semibold"
          title="이 근무일을 보상하는 대휴 날짜"
        >
          →{Number(compLeaveDate.slice(5, 7))}/{Number(compLeaveDate.slice(8, 10))}
        </span>
      )}
      <span className="flex items-center gap-0.5 ml-auto font-bold text-[13px]">
        {isMain && (
          <span title={current === "dawn" ? "새벽 메인당직" : "야간 메인당직"}>★</span>
        )}
        {current === "annual" ? "연차사용" : current ? SHIFT_LABELS[current] : "-"}
        {usageSuffix && <span className="whitespace-normal break-words">{usageSuffix}</span>}
      </span>
    </button>
  );
}

function formatShortDate(date: string): string {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
}

interface TimeBarCellProps {
  employeeName: string;
  shift: Shift | null;
  leaveUsages: ShiftLeaveUsage[];
  compLeaveDate?: string | null;
  invalidReason?: string | null;
  severe: boolean;
  unassignedLeave: boolean;
  showColors: boolean;
  timeAxis: TimeAxis;
  timeLabel: string | null;
  usageSuffix: string;
  usageDetails: UsageDetail[];
  isFullyOnLeave: boolean;
  onClick: () => void;
}

// 시간 막대 보기: 왼쪽 이름 칸은 기존처럼 근무형태 색, 오른쪽은 축 전체(가장 이른 출근~가장
// 늦은 퇴근) 막대 중 실제 근무 시간대만 칠한다. 근무 중 연차/대휴로 뺀 시간은 회색으로 칠한다.
function TimeBarCell({
  employeeName,
  shift,
  leaveUsages,
  compLeaveDate,
  invalidReason,
  severe,
  unassignedLeave,
  showColors,
  timeAxis,
  timeLabel,
  usageSuffix,
  usageDetails,
  isFullyOnLeave,
  onClick,
}: TimeBarCellProps) {
  const current = shift?.shift_type ?? null;
  const isMain = shift?.is_main ?? false;
  const colorKey = isFullyOnLeave ? "off" : current;
  const colorTokens = colorKey && showColors ? SHIFT_COLORS[colorKey].split(" ") : [];
  const bgClass = colorTokens.filter((c) => c.startsWith("bg-")).join(" ");
  const borderClass =
    colorTokens.filter((c) => c.startsWith("border-")).join(" ") || "border-gray-200";

  const showSevere = severe && showColors;
  const showInvalid = !!invalidReason && showColors;
  const showUnassignedLeave = unassignedLeave && showColors;

  const containerClass = showSevere
    ? "bg-red-50 border-2 border-red-400 text-red-700 font-extrabold"
    : showInvalid
    ? `bg-white ${borderClass} text-red-800 font-bold`
    : showUnassignedLeave
    ? `bg-white ${borderClass} text-blue-600 font-bold`
    : `bg-white ${borderClass} text-black`;

  const bar = computeShiftTimeBar(shift, leaveUsages, timeAxis);
  const ticks = computeAxisTicks(timeAxis);
  // 색상 끄기 상태에서도 막대 위치 자체가 정보라 회색으로는 칠해둔다.
  const workFillClass = bgClass || "bg-gray-300";

  const label = current === "annual" ? "연차사용" : current ? SHIFT_LABELS[current] : "-";
  const baseRange =
    shift?.start_time && shift?.end_time
      ? `${shift.start_time.slice(0, 5)}~${shift.end_time.slice(0, 5)}`
      : null;

  // 첫 줄은 시간대, 둘째 줄은 특이사항(시차 사용 내역, 연차/대휴 종류, 대휴 원래근무일).
  // 근무 중 시차를 썼으면 목록형과 똑같이 실제로 근무한 시간만 첫 줄에 쓴다.
  let timeLine: string;
  const notes: string[] = [];
  if (bar && isTimedLeave(shift)) {
    timeLine = baseRange!;
    notes.push(label);
  } else if (bar) {
    timeLine = timeLabel ?? baseRange!;
    if (usageSuffix) notes.push(usageSuffix.slice(1, -1));
  } else {
    timeLine = label;
    if (timeLabel) notes.push(timeLabel);
  }
  const hasNoteLine = notes.length > 0 || !!compLeaveDate || showSevere;

  // 글자는 칠해진 구간 폭에 맞춰 가운데 정렬하되, 막대가 맨 왼쪽/오른쪽 끝에 붙어 있으면
  // 그쪽 끝에 맞춰서 칸 밖으로 잘리지 않게 한다.
  const spanLeft = bar?.spanLeft ?? 0;
  const spanRight = bar?.spanRight ?? 100;
  const alignClass = !bar
    ? "items-center"
    : spanLeft <= 0.5
    ? "items-start pl-1"
    : spanRight >= 99.5
    ? "items-end pr-1"
    : "items-center";

  const tooltip = [
    invalidReason,
    unassignedLeave ? "대휴 원래근무일이 아직 지정 안 됐어요" : null,
    `${employeeName} · ${label} · ${timeLine}${notes.length > 0 ? ` (${notes.join(", ")})` : ""}`,
    ...usageDetails.map(
      (d) => `  ${d.label} ${d.start}~${d.end} (${d.hours}h)${d.reason ? ` ${d.reason}` : ""}`
    ),
    compLeaveDate ? `이 근무일을 보상하는 대휴: ${formatShortDate(compLeaveDate)}` : null,
  ]
    .filter((line): line is string => !!line)
    .join("\n");

  return (
    <button
      type="button"
      onClick={onClick}
      title={tooltip}
      className={`w-full h-8 flex items-stretch rounded-lg border overflow-hidden text-xs whitespace-nowrap transition-all duration-150 ease-out cursor-pointer hover:shadow-sm hover:-translate-y-0.5 ${
        showSevere ? "hover:bg-red-100" : "hover:brightness-95"
      } active:translate-y-0 active:shadow-none ${containerClass}`}
    >
      <span
        className={`w-16 shrink-0 flex items-center gap-0.5 px-1 font-bold text-[13px] ${
          showSevere ? "" : bgClass
        }`}
      >
        <span className="truncate">{employeeName}</span>
        {isMain && (
          <span
            className="shrink-0 text-[11px]"
            title={current === "dawn" ? "새벽 메인당직" : "야간 메인당직"}
          >
            ★
          </span>
        )}
      </span>

      {/* 이름 칸과 막대 사이에 흰 틈 + 진한 선을 둬서, 이름 칸 색과 막대 색이 붙어 보이지 않게 */}
      <span className="relative flex-1 min-w-0 ml-[3px] bg-white border-l border-black/30">
        {ticks.map((left) => (
          <span
            key={left}
            aria-hidden
            className="absolute top-0 bottom-0 w-px bg-black/10"
            style={{ left: `${left}%` }}
          />
        ))}
        {bar?.segments.map((seg, i) => (
          <span
            key={i}
            aria-hidden
            className={`absolute top-0 bottom-0 ${
              seg.kind === "work" ? workFillClass : USAGE_FILL_CLASS
            }`}
            style={{ left: `${seg.left}%`, width: `${seg.width}%` }}
          />
        ))}
        {bar?.clippedStart && (
          <span aria-hidden className="absolute left-0 top-0 bottom-0 flex items-center text-[9px]">
            ◀
          </span>
        )}
        {bar?.clippedEnd && (
          <span aria-hidden className="absolute right-0 top-0 bottom-0 flex items-center text-[9px]">
            ▶
          </span>
        )}
        {/* 시간대는 특이사항 유무와 상관없이 항상 첫 줄(위쪽)에 고정 */}
        <span
          className={`absolute top-0 bottom-0 flex flex-col justify-start pt-px ${alignClass}`}
          style={{ left: `${spanLeft}%`, width: `${spanRight - spanLeft}%` }}
        >
          <span className="text-xs leading-[14px] font-semibold tracking-tight">{timeLine}</span>
          {hasNoteLine && (
            <span className="flex items-center gap-1 text-[11px] leading-[13px] font-medium">
              {showSevere && <span aria-hidden>⚠️</span>}
              {notes.length > 0 && <span>{notes.join(", ")}</span>}
              {compLeaveDate && (
                <span className="text-blue-700">→{formatShortDate(compLeaveDate)}</span>
              )}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}
