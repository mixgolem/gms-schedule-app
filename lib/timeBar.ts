import { Shift, ShiftLeaveUsage } from "./types";
import { ShiftDefaultsMap } from "./useShiftDefaults";

// 근무표 칸의 "시간 막대" 계산. 모든 시각은 00:00부터의 분(minute)으로 다루고, 퇴근이
// 출근보다 같거나 이르면(예: 15:00~00:00) 자정을 넘긴 것으로 보고 1440분을 더한다.

export interface TimeAxis {
  start: number;
  end: number;
}

export interface BarSegment {
  left: number; // 축 전체 대비 %
  width: number; // 축 전체 대비 %
  kind: "work" | "usage"; // usage = 연차/대휴/기타로 쉬는 구간(근무 중 시차 포함)
}

export interface ShiftTimeBar {
  segments: BarSegment[];
  spanLeft: number; // 근무 전체(출근~퇴근)의 시작 위치 %
  spanRight: number; // 근무 전체의 끝 위치 %
  clippedStart: boolean; // 축보다 일찍 시작해서 잘렸는지
  clippedEnd: boolean; // 축보다 늦게 끝나서 잘렸는지
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

function normalizeRange(start: string, end: string): [number, number] {
  const s = toMinutes(start);
  let e = toMinutes(end);
  if (e <= s) e += 1440;
  return [s, e];
}

export function formatAxisTime(minutes: number): string {
  if (minutes === 1440) return "24:00";
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

// 근무시간 설정의 새벽/주간/야간 중 가장 이른 출근 ~ 가장 늦은 퇴근을 막대 전체 범위로 쓴다.
// 모든 칸이 같은 축을 써야 날짜끼리 위아래로 비교가 된다.
export function computeTimeAxis(defaults: ShiftDefaultsMap): TimeAxis {
  const ranges = (["dawn", "day", "night"] as const).map((t) =>
    normalizeRange(defaults[t].start, defaults[t].end)
  );
  return {
    start: Math.min(...ranges.map(([s]) => s)),
    end: Math.max(...ranges.map(([, e]) => e)),
  };
}

// 3시간 간격 정각 눈금(축 안쪽만) — 막대 위치를 대략 읽기 위한 연한 세로선용.
export function computeAxisTicks(axis: TimeAxis): number[] {
  const total = axis.end - axis.start;
  const ticks: number[] = [];
  for (let m = Math.ceil(axis.start / 180) * 180; m < axis.end; m += 180) {
    if (m > axis.start) ticks.push(((m - axis.start) / total) * 100);
  }
  return ticks;
}

// 시간 막대로 그릴 수 있는 근무인지: 새벽/주간/야간, 그리고 시간이 정해진 연차·본인대휴.
// 휴무나 원래근무일로 연결되는 일반 대휴는 시간대가 없어서 막대 없이 글자로만 표시한다.
export function isTimedLeave(shift: Shift | null): boolean {
  return (
    shift?.shift_type === "annual" || (shift?.shift_type === "leave" && !!shift.is_personal_leave)
  );
}

export function computeShiftTimeBar(
  shift: Shift | null,
  leaveUsages: ShiftLeaveUsage[],
  axis: TimeAxis
): ShiftTimeBar | null {
  if (!shift || !shift.start_time || !shift.end_time) return null;
  const isWork =
    shift.shift_type === "dawn" || shift.shift_type === "day" || shift.shift_type === "night";
  if (!isWork && !isTimedLeave(shift)) return null;

  const [s, e] = normalizeRange(shift.start_time, shift.end_time);

  const ranges: { range: [number, number]; kind: BarSegment["kind"] }[] = [];
  if (!isWork) {
    ranges.push({ range: [s, e], kind: "usage" });
  } else {
    // 부분사용 구간도 근무 기준으로 맞춘다(자정 넘어 쓴 구간이면 1440분을 더해 이어 붙임).
    const used = leaveUsages
      .map((u) => {
        let [us, ue] = normalizeRange(u.start_time, u.end_time);
        if (us < s) {
          us += 1440;
          ue += 1440;
        }
        return [Math.max(us, s), Math.min(ue, e)] as [number, number];
      })
      .filter(([us, ue]) => ue > us)
      .sort((a, b) => a[0] - b[0]);

    let cursor = s;
    for (const [us, ue] of used) {
      if (us > cursor) ranges.push({ range: [cursor, us], kind: "work" });
      ranges.push({ range: [Math.max(us, cursor), ue], kind: "usage" });
      cursor = Math.max(cursor, ue);
    }
    if (cursor < e) ranges.push({ range: [cursor, e], kind: "work" });
  }

  const total = axis.end - axis.start;
  const pct = (m: number) => Math.min(100, Math.max(0, ((m - axis.start) / total) * 100));

  const segments = ranges
    .map(({ range: [rs, re], kind }) => ({ left: pct(rs), width: pct(re) - pct(rs), kind }))
    .filter((seg) => seg.width > 0);

  return {
    segments,
    spanLeft: pct(s),
    spanRight: pct(e),
    clippedStart: s < axis.start,
    clippedEnd: e > axis.end,
  };
}
