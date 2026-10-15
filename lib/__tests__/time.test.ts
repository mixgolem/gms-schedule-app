import { describe, expect, it } from "vitest";
import { computeRemainingRanges, validateSubRanges } from "../timeRanges";
import { computeShiftTimeBar, computeTimeAxis, formatAxisTime } from "../timeBar";
import { computeWeeklyHours } from "../workStats";
import { dates, makeEmployee, makeShift, makeUsage } from "./factories";

describe("부분사용 시간 검사 (validateSubRanges)", () => {
  const dawn = { start: "06:30", end: "15:30" };

  it("근무시간 안이면 통과", () => {
    expect(validateSubRanges(dawn, [{ start: "10:30", end: "15:30", label: "연차" }]).valid).toBe(true);
  });

  it("근무시간을 벗어나면 실패", () => {
    const r = validateSubRanges(dawn, [{ start: "05:00", end: "08:00", label: "연차" }]);
    expect(r.valid).toBe(false);
    expect(r.error).toContain("범위");
  });

  it("두 항목이 겹치면 실패", () => {
    const r = validateSubRanges(dawn, [
      { start: "07:00", end: "10:00", label: "연차" },
      { start: "09:00", end: "11:00", label: "대휴" },
    ]);
    expect(r.valid).toBe(false);
    expect(r.error).toContain("겹쳐");
  });

  it("자정을 넘는 야간(15:00~00:00)도 처리", () => {
    const night = { start: "15:00", end: "00:00" };
    expect(validateSubRanges(night, [{ start: "20:00", end: "00:00", label: "대휴" }]).valid).toBe(true);
  });
});

describe("남은 근무 구간 (computeRemainingRanges)", () => {
  it("새벽 06:30~15:30에서 10:30부터 연차 → 06:30~10:30만 근무", () => {
    expect(
      computeRemainingRanges({ start: "06:30", end: "15:30" }, [{ start: "10:30", end: "15:30" }])
    ).toEqual([{ start: "06:30", end: "10:30" }]);
  });

  it("가운데를 빼면 앞뒤 두 구간", () => {
    expect(
      computeRemainingRanges({ start: "09:00", end: "18:00" }, [{ start: "12:00", end: "14:00" }])
    ).toEqual([
      { start: "09:00", end: "12:00" },
      { start: "14:00", end: "18:00" },
    ]);
  });
});

describe("시간 막대 (timeBar)", () => {
  const defaults = {
    dawn: { start: "06:30", end: "15:30" },
    day: { start: "09:00", end: "18:00" },
    night: { start: "15:00", end: "00:00" },
  };

  it("축은 가장 이른 출근 ~ 가장 늦은 퇴근", () => {
    const axis = computeTimeAxis(defaults);
    expect(formatAxisTime(axis.start)).toBe("06:30");
    expect(formatAxisTime(axis.end)).toBe("24:00");
  });

  it("야간 근무 중 대휴를 쓰면 근무+회색 구간으로 나뉨", () => {
    const axis = computeTimeAxis(defaults);
    const shift = makeShift({
      employee_id: "a",
      work_date: "2026-10-01",
      shift_type: "night",
      start_time: "15:00",
      end_time: "00:00",
    });
    const usage = makeUsage(shift, {
      usage_type: "personal_leave",
      hours: 4,
      start_time: "20:00",
      end_time: "00:00",
    });
    const bar = computeShiftTimeBar(shift, [usage], axis)!;
    expect(bar.segments.map((s) => s.kind)).toEqual(["work", "usage"]);
    expect(bar.spanRight).toBe(100);
    expect(bar.clippedEnd).toBe(false);
  });

  it("휴무는 막대 없음", () => {
    const axis = computeTimeAxis(defaults);
    const shift = makeShift({ employee_id: "a", work_date: "2026-10-01", shift_type: "off" });
    expect(computeShiftTimeBar(shift, [], axis)).toBeNull();
  });
});

describe("주간 근무시간 (computeWeeklyHours)", () => {
  it("하루 8시간, 본인 대휴 사용시간만 뺌 (연차는 안 뺌)", () => {
    const week = dates("2026-10-05", 7);
    const s1 = makeShift({ employee_id: "a", work_date: week[0], shift_type: "day" });
    const s2 = makeShift({ employee_id: "a", work_date: week[1], shift_type: "dawn" });
    const s3 = makeShift({ employee_id: "a", work_date: week[2], shift_type: "night" });
    const off = makeShift({ employee_id: "a", work_date: week[3], shift_type: "off" });
    const usages = [
      makeUsage(s1, { usage_type: "personal_leave", hours: 4, start_time: "14:00", end_time: "18:00" }),
      makeUsage(s2, { usage_type: "annual", hours: 4, start_time: "11:30", end_time: "15:30" }),
    ];
    const [row] = computeWeeklyHours(week, [makeEmployee("a")], [s1, s2, s3, off], usages);
    expect(row.hours).toBe(8 - 4 + 8 + 8);
  });

  it("그 주가 아닌 날은 안 셈", () => {
    const week = dates("2026-10-05", 7);
    const outside = makeShift({ employee_id: "a", work_date: "2026-10-12", shift_type: "day" });
    const [row] = computeWeeklyHours(week, [makeEmployee("a")], [outside], []);
    expect(row.hours).toBe(0);
  });
});
