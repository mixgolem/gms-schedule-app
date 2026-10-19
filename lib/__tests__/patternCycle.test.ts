import { describe, expect, it } from "vitest";
import { addDays, format } from "date-fns";
import {
  computeCycleStatus,
  detectCycleFromShifts,
  startDateAlignment,
  PatternCandidate,
  ShiftSample,
} from "../patternCycle";

// 실제 운영 예: 7명·49일 패턴이 2026-09-21에 시작한 주기
const START = "2026-09-21";

describe("근무패턴 주기 계산 (computeCycleStatus)", () => {
  it("10/19는 1주기 29일차, 11/8 종료, 다음 주기 11/9", () => {
    const s = computeCycleStatus(START, 49, "2026-10-19")!;
    expect(s.dayInCycle).toBe(29);
    expect(s.cycleEnd).toBe("2026-11-08");
    expect(s.daysLeft).toBe(20);
    expect(s.nextCycleStart).toBe("2026-11-09");
    expect(s.followingCycleStart).toBe("2026-12-28");
  });

  it("기준일이 몇 주기 전이어도 같은 경계를 찾음", () => {
    const s = computeCycleStatus("2026-08-03", 49, "2026-10-19")!; // 9/21보다 한 주기 전
    expect(s.cycleNumber).toBe(2);
    expect(s.cycleStart).toBe("2026-09-21");
    expect(s.nextCycleStart).toBe("2026-11-09");
  });

  it("주기 마지막 날은 49일차, 남은 날 0", () => {
    const s = computeCycleStatus(START, 49, "2026-11-08")!;
    expect(s.dayInCycle).toBe(49);
    expect(s.daysLeft).toBe(0);
    expect(s.nextCycleStart).toBe("2026-11-09");
  });

  it("주기 첫날이면 오늘이 바로 주기 시작일", () => {
    const s = computeCycleStatus(START, 49, "2026-11-09")!;
    expect(s.dayInCycle).toBe(1);
    expect(s.nextCycleStart).toBe("2026-11-09");
  });
});

describe("시작일 주기 맞춤 검사 (startDateAlignment)", () => {
  it("주기 첫날들은 맞춤", () => {
    expect(startDateAlignment(START, 49, "2026-11-09").aligned).toBe(true);
    expect(startDateAlignment(START, 49, "2026-12-28").aligned).toBe(true);
  });

  it("주기 중간은 며칠차인지 알려줌", () => {
    expect(startDateAlignment(START, 49, "2026-10-19")).toEqual({ aligned: false, dayInCycle: 29 });
  });
});

describe("실제 근무표로 주기 알아내기 (detectCycleFromShifts)", () => {
  // 7일·3명짜리 작은 패턴
  const T = ["dawn", "day", "night", "off", "leave", "day", "dawn"];
  const pattern: PatternCandidate = {
    id: "p1",
    days: T.map((_, d) => [0, 1, 2].map((slot) => ({ shiftType: T[(d + slot * 2) % 7], isMain: slot === 0 }))),
  };
  const slots = new Map([
    ["a", 0],
    ["b", 1],
    ["c", 2],
  ]);
  const ymd = (d: Date) => format(d, "yyyy-MM-dd");

  // patternStart부터 패턴대로 근무가 들어간 근무표를 만든다(today 포함 이전 n일)
  function makeShifts(patternStart: string, today: string, n: number, noise = 0): ShiftSample[] {
    const out: ShiftSample[] = [];
    const t = new Date(today + "T00:00:00");
    const ps = new Date(patternStart + "T00:00:00");
    for (let i = 0; i < n; i++) {
      const date = addDays(t, -i);
      const idx = (((Math.round((date.getTime() - ps.getTime()) / 86400000)) % 7) + 7) % 7;
      for (const [emp, slot] of slots) {
        const cell = pattern.days[idx][slot]!;
        const altered = noise > 0 && (i * 3 + slot) % Math.round(1 / noise) === 0;
        out.push({ employee_id: emp, work_date: ymd(date), shift_type: altered ? "annual" : cell.shiftType, is_main: cell.isMain });
      }
    }
    return out;
  }

  it("근무표가 패턴대로면 시작 위치를 정확히 찾음", () => {
    const r = detectCycleFromShifts([pattern], makeShifts("2026-10-05", "2026-10-19", 14), slots, "2026-10-19")!;
    expect(r.cycleLength).toBe(7);
    expect(r.matchRate).toBe(1);
    // 10/5가 주기 첫날이면 10/19도 주기 첫날(14일 = 2주기)
    expect(startDateAlignment(r.anchorStart, 7, "2026-10-05").aligned).toBe(true);
  });

  it("대휴·연차로 일부 바뀌어도(약 10%) 찾음", () => {
    const r = detectCycleFromShifts([pattern], makeShifts("2026-10-07", "2026-10-19", 14, 0.1), slots, "2026-10-19")!;
    expect(r.matchRate).toBeGreaterThan(0.8);
    expect(startDateAlignment(r.anchorStart, 7, "2026-10-07").aligned).toBe(true);
  });

  it("비교할 기록이 너무 적으면 모름(null)", () => {
    expect(detectCycleFromShifts([pattern], makeShifts("2026-10-05", "2026-10-19", 3), slots, "2026-10-19")).toBeNull();
  });

  it("어떤 패턴과도 안 맞으면 모름(null)", () => {
    const random: ShiftSample[] = makeShifts("2026-10-05", "2026-10-19", 14).map((s) => ({ ...s, shift_type: "annual" }));
    expect(detectCycleFromShifts([pattern], random, slots, "2026-10-19")).toBeNull();
  });
});
