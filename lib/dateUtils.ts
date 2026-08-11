import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
} from "date-fns";

export function getMonthDates(year: number, month: number): string[] {
  const start = startOfMonth(new Date(year, month - 1, 1));
  const end = endOfMonth(start);
  return eachDayOfInterval({ start, end }).map((d) => format(d, "yyyy-MM-dd"));
}

// 오늘 날짜를 'yyyy-MM-dd'로. 캘린더에서 오늘 칸을 강조할 때 쓴다.
export function todayStr(): string {
  return format(new Date(), "yyyy-MM-dd");
}

export interface CalendarDay {
  date: string; // yyyy-MM-dd
  inMonth: boolean;
}

// 엑셀 예시처럼 월~일 주 단위 블록으로 묶은 달력 데이터.
// 해당 월 앞뒤로 남는 칸은 인접 월 날짜로 채워서 항상 7일씩 꽉 찬 주가 되도록 한다.
export function getCalendarWeeks(year: number, month: number): CalendarDay[][] {
  const monthStart = startOfMonth(new Date(year, month - 1, 1));
  const monthEnd = endOfMonth(monthStart);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const allDays = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const weeks: CalendarDay[][] = [];
  for (let i = 0; i < allDays.length; i += 7) {
    weeks.push(
      allDays.slice(i, i + 7).map((d) => ({
        date: format(d, "yyyy-MM-dd"),
        inMonth: d.getMonth() === monthStart.getMonth(),
      }))
    );
  }
  return weeks;
}

const WEEKDAY_KR = ["일", "월", "화", "수", "목", "금", "토"];

// dateStr은 항상 'yyyy-MM-dd' 형식. new Date(string) 파싱은 UTC 기준이라
// 타임존에 따라 요일이 밀릴 수 있어 연/월/일을 직접 넘겨 로컬 기준으로 계산한다.
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function weekdayLabel(dateStr: string): string {
  return WEEKDAY_KR[parseLocalDate(dateStr).getDay()];
}

export function isWeekend(dateStr: string): boolean {
  const day = parseLocalDate(dateStr).getDay();
  return day === 0 || day === 6;
}

export function dayOfMonth(dateStr: string): number {
  return Number(dateStr.slice(8, 10));
}

export type DayColor = "default" | "saturday" | "sunday" | "holiday";

// 공휴일이 요일보다 우선순위가 높다 (토요일이 공휴일이면 공휴일 색상)
export function getDayColor(dateStr: string, isHoliday: boolean): DayColor {
  if (isHoliday) return "holiday";
  const dow = parseLocalDate(dateStr).getDay();
  if (dow === 0) return "sunday";
  if (dow === 6) return "saturday";
  return "default";
}
