import { describe, expect, it } from "vitest";
import { checkPairRule, findConsecutiveWorkStreaks, findNightThenDawnPairs } from "../validation";
import { dates, makeShift, makeUsage } from "./factories";

describe("2인1조 (checkPairRule)", () => {
  it("새벽 2명이면 경고 없음", () => {
    const shifts = [
      makeShift({ employee_id: "a", work_date: "2026-10-01", shift_type: "dawn" }),
      makeShift({ employee_id: "b", work_date: "2026-10-01", shift_type: "dawn" }),
    ];
    expect(checkPairRule(shifts, "2026-10-01", "dawn")).toBeNull();
  });

  it("야간 1명이면 경고", () => {
    const shifts = [makeShift({ employee_id: "a", work_date: "2026-10-01", shift_type: "night" })];
    expect(checkPairRule(shifts, "2026-10-01", "night")).toContain("1명");
  });

  it("야간 3명도 경고", () => {
    const shifts = ["a", "b", "c"].map((id) =>
      makeShift({ employee_id: id, work_date: "2026-10-01", shift_type: "night" })
    );
    expect(checkPairRule(shifts, "2026-10-01", "night")).toContain("3명");
  });

  it("주간은 인원 상관없이 검사 안 함", () => {
    const shifts = [makeShift({ employee_id: "a", work_date: "2026-10-01", shift_type: "day" })];
    expect(checkPairRule(shifts, "2026-10-01", "day")).toBeNull();
  });
});

describe("연속 7일 근무 (findConsecutiveWorkStreaks)", () => {
  it("7일 연속이면 7일 전부 표시", () => {
    const shifts = dates("2026-10-01", 7).map((d) =>
      makeShift({ employee_id: "a", work_date: d, shift_type: "day" })
    );
    const flagged = findConsecutiveWorkStreaks(shifts);
    expect(flagged.size).toBe(7);
    expect(flagged.has("a_2026-10-01")).toBe(true);
    expect(flagged.has("a_2026-10-07")).toBe(true);
  });

  it("6일 연속은 괜찮음", () => {
    const shifts = dates("2026-10-01", 6).map((d) =>
      makeShift({ employee_id: "a", work_date: d, shift_type: "dawn" })
    );
    expect(findConsecutiveWorkStreaks(shifts).size).toBe(0);
  });

  it("중간에 휴무가 끼면 끊김", () => {
    const shifts = dates("2026-10-01", 8).map((d, i) =>
      makeShift({ employee_id: "a", work_date: d, shift_type: i === 3 ? "off" : "night" })
    );
    expect(findConsecutiveWorkStreaks(shifts).size).toBe(0);
  });

  it("월말→월초로 이어져도 잡음", () => {
    const shifts = dates("2026-09-27", 7).map((d) =>
      makeShift({ employee_id: "a", work_date: d, shift_type: "day" })
    );
    expect(findConsecutiveWorkStreaks(shifts).has("a_2026-10-03")).toBe(true);
  });

  it("근무시간 전체를 대휴로 쓴 날은 근무로 안 쳐서 끊김", () => {
    const shifts = dates("2026-10-01", 7).map((d) =>
      makeShift({
        employee_id: "a",
        work_date: d,
        shift_type: "day",
        start_time: "09:00",
        end_time: "18:00",
      })
    );
    const usages = [
      makeUsage(shifts[3], {
        usage_type: "personal_leave",
        hours: 8,
        start_time: "09:00",
        end_time: "18:00",
      }),
    ];
    expect(findConsecutiveWorkStreaks(shifts, usages).size).toBe(0);
  });

  it("사람별로 따로 셈", () => {
    const shifts = dates("2026-10-01", 7).map((d, i) =>
      makeShift({ employee_id: i % 2 === 0 ? "a" : "b", work_date: d, shift_type: "day" })
    );
    expect(findConsecutiveWorkStreaks(shifts).size).toBe(0);
  });
});

describe("야간 다음날 새벽 (findNightThenDawnPairs)", () => {
  it("야간 → 다음날 새벽이면 두 날 다 표시", () => {
    const shifts = [
      makeShift({ employee_id: "a", work_date: "2026-10-01", shift_type: "night" }),
      makeShift({ employee_id: "a", work_date: "2026-10-02", shift_type: "dawn" }),
    ];
    const flagged = findNightThenDawnPairs(shifts);
    expect([...flagged].sort()).toEqual(["a_2026-10-01", "a_2026-10-02"]);
  });

  it("하루 띄우면 괜찮음", () => {
    const shifts = [
      makeShift({ employee_id: "a", work_date: "2026-10-01", shift_type: "night" }),
      makeShift({ employee_id: "a", work_date: "2026-10-03", shift_type: "dawn" }),
    ];
    expect(findNightThenDawnPairs(shifts).size).toBe(0);
  });

  it("새벽 → 다음날 야간은 괜찮음", () => {
    const shifts = [
      makeShift({ employee_id: "a", work_date: "2026-10-01", shift_type: "dawn" }),
      makeShift({ employee_id: "a", work_date: "2026-10-02", shift_type: "night" }),
    ];
    expect(findNightThenDawnPairs(shifts).size).toBe(0);
  });

  it("다른 사람끼리는 상관없음", () => {
    const shifts = [
      makeShift({ employee_id: "a", work_date: "2026-10-01", shift_type: "night" }),
      makeShift({ employee_id: "b", work_date: "2026-10-02", shift_type: "dawn" }),
    ];
    expect(findNightThenDawnPairs(shifts).size).toBe(0);
  });
});
