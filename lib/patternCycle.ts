import { addDays, differenceInCalendarDays, format } from "date-fns";
import { parseLocalDate } from "./dateUtils";

// 지금 적용돼 있는 근무패턴(시작일 + 패턴 길이)을 기준으로 "몇 번째 주기의 며칠차인지",
// "다음 주기가 언제 시작하는지"를 계산한다. 새 패턴은 진행 중인 주기가 끝난 다음 날(=주기
// 경계)부터 적용해야 근무자별 휴무·대휴 개수와 근무 순서가 어긋나지 않는다.

function shift(date: string, days: number): string {
  return format(addDays(parseLocalDate(date), days), "yyyy-MM-dd");
}

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

export interface CycleStatus {
  // 오늘이 적용 시작일 이전이면(예약 적용) false
  started: boolean;
  cycleNumber: number; // 1부터
  dayInCycle: number; // 1부터
  cycleLength: number;
  cycleStart: string;
  cycleEnd: string;
  daysLeft: number; // 오늘 포함하지 않고 주기 끝까지 남은 날 수
  nextCycleStart: string; // 새 패턴을 넣기 좋은 가장 빠른 주기 시작일(오늘이 주기 첫날이면 오늘)
  followingCycleStart: string; // 그다음 주기 시작일
}

// anchorStart: 이 패턴 주기의 첫날 중 아무 날(보통 detectCycleFromShifts가 찾은 날)
export function computeCycleStatus(
  anchorStart: string,
  cycleLength: number,
  today: string
): CycleStatus | null {
  if (!Number.isFinite(cycleLength) || cycleLength < 1) return null;
  const diff = differenceInCalendarDays(parseLocalDate(today), parseLocalDate(anchorStart));

  if (diff < 0) {
    return {
      started: false,
      cycleNumber: 0,
      dayInCycle: 0,
      cycleLength,
      cycleStart: anchorStart,
      cycleEnd: shift(anchorStart, cycleLength - 1),
      daysLeft: 0,
      nextCycleStart: anchorStart,
      followingCycleStart: shift(anchorStart, cycleLength),
    };
  }

  const cycleIndex = Math.floor(diff / cycleLength);
  const dayIndex = diff % cycleLength;
  const cycleStart = shift(anchorStart, cycleIndex * cycleLength);
  const cycleEnd = shift(cycleStart, cycleLength - 1);
  const nextCycleStart = dayIndex === 0 ? today : shift(cycleEnd, 1);

  return {
    started: true,
    cycleNumber: cycleIndex + 1,
    dayInCycle: dayIndex + 1,
    cycleLength,
    cycleStart,
    cycleEnd,
    daysLeft: cycleLength - dayIndex - 1,
    nextCycleStart,
    followingCycleStart: shift(nextCycleStart, cycleLength),
  };
}

export interface PatternCandidate {
  id: string;
  days: ({ shiftType: string; isMain: boolean } | null)[][]; // [일차][근무자 슬롯]
}

export interface ShiftSample {
  employee_id: string;
  work_date: string;
  shift_type: string;
  is_main: boolean;
}

export interface DetectedCycle {
  patternId: string;
  cycleLength: number;
  anchorStart: string; // 이 패턴 주기의 첫날 중 하나(오늘 이전 가장 가까운 주기 시작일)
  matchRate: number; // 0~1
  compared: number; // 비교한 근무 기록 수
}

const MIN_COMPARED = 20;
const MIN_MATCH_RATE = 0.6;

// 적용 기록은 테스트·재적용·근무표 업로드 등으로 실제와 어긋날 수 있어서, 실제 근무표를 보고
// "지금 어떤 패턴이 며칠차로 돌아가고 있는지"를 알아낸다. 저장된 패턴마다 가능한 모든 시작
// 위치를 최근 근무 기록과 맞춰 보고 가장 잘 맞는 것을 고른다. 대휴·연차처럼 개별로 바꾼 칸이
// 있어도 대부분 맞으면 인정하고, 일치율이 낮거나 비교할 기록이 너무 적으면 null(모름).
export function detectCycleFromShifts(
  patterns: PatternCandidate[],
  shifts: ShiftSample[],
  slotByEmployee: Map<string, number>, // employee_id → 패턴 슬롯(0부터, sort_order - 1)
  today: string
): DetectedCycle | null {
  const todayDate = parseLocalDate(today);
  const samples = shifts
    .map((s) => ({
      slot: slotByEmployee.get(s.employee_id),
      offset: differenceInCalendarDays(parseLocalDate(s.work_date), todayDate), // 0 이하
      type: s.shift_type,
      main: !!s.is_main,
    }))
    .filter((s): s is { slot: number; offset: number; type: string; main: boolean } => s.slot !== undefined);

  let best: DetectedCycle | null = null;
  for (const pattern of patterns) {
    const length = pattern.days.length;
    if (length === 0) continue;
    // phase = 오늘이 이 패턴의 몇 번째 일차(0부터)인지
    for (let phase = 0; phase < length; phase++) {
      let compared = 0;
      let matched = 0;
      for (const s of samples) {
        const cell = pattern.days[mod(phase + s.offset, length)]?.[s.slot];
        if (!cell) continue;
        compared++;
        if (cell.shiftType === s.type && !!cell.isMain === s.main) matched++;
      }
      if (compared < MIN_COMPARED) continue;
      const rate = matched / compared;
      if (!best || rate > best.matchRate) {
        best = {
          patternId: pattern.id,
          cycleLength: length,
          anchorStart: shift(today, -phase),
          matchRate: rate,
          compared,
        };
      }
    }
  }
  return best && best.matchRate >= MIN_MATCH_RATE ? best : null;
}

// 고른 시작일이 지금 패턴의 주기 경계(어느 주기의 첫날)인지, 아니면 주기 중간 며칠차인지
export function startDateAlignment(
  anchorStart: string,
  cycleLength: number,
  date: string
): { aligned: boolean; dayInCycle: number } {
  const diff = differenceInCalendarDays(parseLocalDate(date), parseLocalDate(anchorStart));
  const dayIndex = mod(diff, cycleLength);
  return { aligned: dayIndex === 0, dayInCycle: dayIndex + 1 };
}
