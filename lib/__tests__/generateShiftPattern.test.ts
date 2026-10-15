import { describe, expect, it } from "vitest";
import {
  generateShiftPattern,
  verifyGeneratedPattern,
  GeneratedPatternResult,
  MIN_EMPLOYEES,
} from "../generateShiftPattern";

function generateOk(employeeCount: number, cycleMultiplier = 1): GeneratedPatternResult {
  const result = generateShiftPattern({ employeeCount, cycleMultiplier });
  if ("error" in result) throw new Error(result.error);
  return result;
}

describe("근무패턴 자동 생성", () => {
  it(`${MIN_EMPLOYEES}명 미만이면 만들지 않음`, () => {
    expect("error" in generateShiftPattern({ employeeCount: MIN_EMPLOYEES - 1 })).toBe(true);
  });

  // 무작위 탐색을 쓰므로 여러 번 돌려서 매번 규칙을 지키는지 확인한다.
  for (const n of [6, 7, 8, 9]) {
    it(`${n}명 패턴: 자체 검증 통과 + 매일 새벽·야간 각 2명 (5회 반복)`, () => {
      for (let run = 0; run < 5; run++) {
        const result = generateOk(n);
        expect(result.totalDays).toBe(n * 7);
        expect(verifyGeneratedPattern(result)).toEqual([]);
        for (const day of result.days) {
          const count = (type: string) => day.filter((c) => c?.shiftType === type).length;
          expect(count("dawn")).toBe(2);
          expect(count("night")).toBe(2);
        }
      }
    });
  }

  it("주기 2배(7명·98일)도 규칙 유지", () => {
    const result = generateOk(7, 2);
    expect(result.totalDays).toBe(98);
    expect(verifyGeneratedPattern(result)).toEqual([]);
  });

  it("근무자별로 7일 연속 근무·야간 다음날 새벽이 없음 (주기 반복 경계 포함)", () => {
    const result = generateOk(7);
    const D = result.totalDays;
    for (let slot = 0; slot < result.employeeCount; slot++) {
      let streak = 0;
      // 두 바퀴 돌아야 끝→처음으로 이어지는 경계도 검사된다
      for (let i = 0; i < D * 2; i++) {
        const cell = result.days[i % D][slot];
        const isWork = cell?.shiftType === "dawn" || cell?.shiftType === "day" || cell?.shiftType === "night";
        streak = isWork ? streak + 1 : 0;
        expect(streak).toBeLessThan(7);
        const next = result.days[(i + 1) % D][slot];
        expect(cell?.shiftType === "night" && next?.shiftType === "dawn").toBe(false);
      }
    }
  });
});
