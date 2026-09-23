import { PatternCell, PatternDays } from "./shiftPatternImport";
import { ShiftType } from "./types";

// 자동 생성 전용 모듈 — 수동 엑셀 업로드(shiftPatternImport.ts, 49일/7명 고정)는 그대로 두고,
// 인원수(N)·주기 배수를 입력받아 유연하게 N명짜리 패턴을 새로 만든다.
//
// 핵심 원리: 길이 D=N×7×배수인 "마스터 시퀀스" M을 하루씩 채운 뒤, i번째 근무자의 실제
// D일 스케줄 = M을 7×i일만큼 순환 이동(rotate)한 것으로 정의한다. 이렇게 하면
//   1) 모든 근무자가 "같은 M을 순서만 바꿔 읽는 것"이 되어, 메·조·야·여·주·휴·대 개수가
//      자동으로 전원 동일해진다(수학적으로 항상 성립, 런타임 보정 불필요).
//   2) 7일 단위로 미는 방식이라, 달력에 적용했을 때 주말(요일)에 걸리는 근무자별 분배도
//      같은 논리로 자동으로 공평해진다.
// 대신 하루 단위 "메·조·야·여 각 1명씩" 조건과 "7일 연속 금지·야간 다음날 새벽 금지" 같은
// 순차 규칙은 M 자체가 만족해야 하고(뒤→앞 순환 경계까지 포함해서), 이를 요일(mod 7) 트랙별
// 백트래킹으로 구성해 보장한다.

export type GenCategory = "메" | "조" | "야" | "여" | "주" | "휴" | "대";

const REQUIRED: GenCategory[] = ["메", "조", "야", "여"];
const FREE: GenCategory[] = ["주", "휴", "대"];
const WORK = new Set<GenCategory>(["메", "조", "야", "여", "주"]);
const NIGHT = new Set<GenCategory>(["야", "여"]);
const DAWN = new Set<GenCategory>(["메", "조"]);

const WEEK = 7;
const MAX_STREAK = 6; // 7일 연속부터 위반이므로 연속 근무는 최대 6일까지만 허용

// 1일차=월요일로 보고, 6·7일차(요일 잔차 5·6)만 주말(토·일)로 취급한다.
// 휴(주말에 쉼)는 주말에만, 대(평일에 쉼 — 주말 근무 보상)와 주(주간 근무)는 평일에만
// 올 수 있다 — 그래서 주말의 새벽·야간이 아닌 나머지는 전부 휴가 된다.
const WEEKEND_TRACKS = new Set([5, 6]);

function freeOptionsFor(day: number): GenCategory[] {
  return WEEKEND_TRACKS.has(day % WEEK) ? ["휴"] : ["주", "대"];
}

// 평일 5일 근무·주말 2일 휴무가 기준이라, 근무자 1명당 "휴+대"는 7일(1주)마다 정확히
// 2일이어야 한다. 주말 자리 수(2×배수×(N-4))는 요일 배정에서 자동으로 정해지니, 대만
// 따로 목표치를 두면 된다 — 계산해보면 인원수(N)와 무관하게 항상 8×배수로 고정된다
// (예: 7명·49일 기준 실제 사용 중인 패턴도 대 8개·휴 6개로 정확히 일치).
const DAE_PER_MULTIPLIER = 8;

// 최소 인원수: N=5면 평일 자리(5×배수×(N-4)=5×배수)가 대 목표치(8×배수)보다 적어서
// 수학적으로 불가능하다 — 5(N-4)≥8 → N≥6부터 성립한다.
export const MIN_EMPLOYEES = 6;

const CATEGORY_TO_CELL: Record<GenCategory, { shiftType: ShiftType; isMain: boolean }> = {
  메: { shiftType: "dawn", isMain: true },
  조: { shiftType: "dawn", isMain: false },
  야: { shiftType: "night", isMain: true },
  여: { shiftType: "night", isMain: false },
  주: { shiftType: "day", isMain: false },
  휴: { shiftType: "off", isMain: false },
  대: { shiftType: "leave", isMain: false },
};

interface SeqState {
  streak: number; // 직전까지의 연속 근무일수
  wasNight: boolean; // 직전 날이 야간(야/여)이었는지
  daeRemaining: number; // 아직 배치해야 할 '대' 남은 개수
}

// 요일(mod 7) 트랙별로, "그 트랙 안에서 N일마다 반복되는 위치(잔차)" 중 4개를
// 메/조/야/여에 고정 배정한다. 같은 잔차는 트랙 전체(여러 주기여도)에서 항상 같은 역할이라
// N일 간격 슬라이딩 윈도우 어디를 잘라도 항상 메·조·야·여가 정확히 1개씩 걸린다.
function randomTrackMap(N: number): Map<number, GenCategory> {
  const residues = shuffled(Array.from({ length: N }, (_, i) => i)).slice(0, 4);
  const roles = shuffled(REQUIRED);
  const map = new Map<number, GenCategory>();
  residues.forEach((res, i) => map.set(res, roles[i]));
  return map;
}

// map[t]가 야간이면서 그 다음날(prevMap 기준 t, wrap이면 (t+1)%N)이 새벽이면 휴식시간
// 부족(야간→새벽 연속) 규칙 위반이라 애초에 배정 단계에서 걸러낸다.
function hasNightDawnClash(
  prevMap: Map<number, GenCategory>,
  nextMap: Map<number, GenCategory>,
  N: number,
  wrap: boolean
): boolean {
  for (const [t, role] of prevMap) {
    if (!NIGHT.has(role)) continue;
    const nextT = wrap ? (t + 1) % N : t;
    const nextRole = nextMap.get(nextT);
    if (nextRole && DAWN.has(nextRole)) return true;
  }
  return false;
}

const MAX_TRACK_ATTEMPTS = 300;

// 요일 7개 트랙의 잔차 배정을 백트래킹으로 구성한다. 각 트랙은 직전 트랙(요일-1)과,
// 토요일(트랙6)→일요일(트랙0)로 넘어가는 순환 경계까지 야간→새벽 충돌이 없어야 한다.
function buildTrackAssignments(N: number): Map<number, GenCategory>[] | null {
  const assignments: (Map<number, GenCategory> | undefined)[] = new Array(WEEK);

  function backtrack(r: number): boolean {
    if (r === WEEK) {
      return !hasNightDawnClash(assignments[WEEK - 1]!, assignments[0]!, N, true);
    }
    for (let attempt = 0; attempt < MAX_TRACK_ATTEMPTS; attempt++) {
      const map = randomTrackMap(N);
      if (r > 0 && hasNightDawnClash(assignments[r - 1]!, map, N, false)) continue;
      assignments[r] = map;
      if (backtrack(r + 1)) return true;
    }
    assignments[r] = undefined;
    return false;
  }

  return backtrack(0) ? (assignments as Map<number, GenCategory>[]) : null;
}

function forcedCategoryAt(
  assignments: Map<number, GenCategory>[],
  day: number,
  N: number
): GenCategory | null {
  const residue = Math.floor(day / WEEK) % N;
  return assignments[day % WEEK].get(residue) ?? null;
}

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function candidatesFor(
  state: SeqState,
  day: number,
  N: number,
  assignments: Map<number, GenCategory>[],
  weekdayFreeRemaining: number[]
): GenCategory[] {
  const forced = forcedCategoryAt(assignments, day, N);
  let options: GenCategory[] = forced ? [forced] : freeOptionsFor(day);

  // 평일 자유 자리(주/대)일 때만 '대' 목표치 배분을 적용한다(주말 자리는 항상 휴 하나뿐).
  if (!forced && !WEEKEND_TRACKS.has(day % WEEK)) {
    const remainingSlotsIncludingToday = weekdayFreeRemaining[day];
    if (state.daeRemaining <= 0) {
      options = options.filter((c) => c !== "대");
    } else if (state.daeRemaining >= remainingSlotsIncludingToday) {
      // 남은 평일 자유 자리 수만큼만 '대'가 남아있다면, 오늘부터는 전부 '대'로 채워야
      // 목표치를 다 소진할 수 있다.
      options = options.filter((c) => c === "대");
    }
  }

  if (state.streak >= MAX_STREAK) options = options.filter((c) => !WORK.has(c));
  if (state.wasNight) options = options.filter((c) => !DAWN.has(c));

  if (options.length <= 1) return options;

  // 연속근무가 쌓여갈수록(4일차 이상) 쉬는 선택지를 먼저 시도해 나중에 강제 휴식이
  // 필요할 때 걸리는 백트래킹을 줄인다(pop()이 배열 끝에서 꺼내므로 끝에 배치).
  if (state.streak < 4) return shuffled(options);
  const work = shuffled(options.filter((c) => WORK.has(c)));
  const rest = shuffled(options.filter((c) => !WORK.has(c)));
  return [...work, ...rest];
}

function advance(state: SeqState, cat: GenCategory): SeqState {
  return {
    streak: WORK.has(cat) ? state.streak + 1 : 0,
    wasNight: NIGHT.has(cat),
    daeRemaining: cat === "대" ? state.daeRemaining - 1 : state.daeRemaining,
  };
}

// 각 날짜부터 끝까지(포함) 남은 "평일 자유 자리(주/대 중 선택)" 개수 — '대' 목표치를
// 언제까지 반드시 다 채워야 하는지 판단하는 기준이 된다.
function computeWeekdayFreeRemaining(
  assignments: Map<number, GenCategory>[],
  N: number,
  D: number
): number[] {
  const remaining = new Array<number>(D + 1).fill(0);
  for (let d = D - 1; d >= 0; d--) {
    const isFreeWeekday =
      !WEEKEND_TRACKS.has(d % WEEK) && forcedCategoryAt(assignments, d, N) === null;
    remaining[d] = remaining[d + 1] + (isFreeWeekday ? 1 : 0);
  }
  return remaining;
}

// 하루씩 순서대로 채우면서 막히면 되돌아가는 반복문 기반 백트래킹(재귀 깊이 문제 회피).
function buildMasterSequence(N: number, D: number, daeTarget: number): GenCategory[] | null {
  const assignments = buildTrackAssignments(N);
  if (!assignments) return null;
  const weekdayFreeRemaining = computeWeekdayFreeRemaining(assignments, N, D);
  if (weekdayFreeRemaining[0] < daeTarget) return null; // 애초에 평일 자유 자리가 부족함

  const initial: SeqState = { streak: 0, wasNight: false, daeRemaining: daeTarget };

  const chosen: GenCategory[] = new Array(D);
  const stateStack: SeqState[] = [initial];
  const candidateStack: GenCategory[][] = [
    candidatesFor(initial, 0, N, assignments, weekdayFreeRemaining),
  ];
  let day = 0;

  const MAX_STEPS = D * 300; // 이상 상황(무한 루프) 방지용 안전장치
  let steps = 0;

  while (day < D) {
    steps++;
    if (steps > MAX_STEPS) return null;

    const cands = candidateStack[day];
    if (!cands || cands.length === 0) {
      stateStack.pop();
      candidateStack.pop();
      day--;
      if (day < 0) return null;
      continue;
    }

    const cat = cands.pop()!;
    chosen[day] = cat;
    const nextState = advance(stateStack[day], cat);
    day++;
    stateStack[day] = nextState;
    if (day < D)
      candidateStack[day] = candidatesFor(nextState, day, N, assignments, weekdayFreeRemaining);
  }

  return chosen;
}

function trailingWorkStreak(M: GenCategory[]): number {
  let n = 0;
  for (let i = M.length - 1; i >= 0; i--) {
    if (WORK.has(M[i])) n++;
    else break;
  }
  return n;
}

function leadingWorkStreak(M: GenCategory[]): number {
  let n = 0;
  for (let i = 0; i < M.length; i++) {
    if (WORK.has(M[i])) n++;
    else break;
  }
  return n;
}

// 패턴이 반복 적용될 수 있으므로(순환), 마지막 날→첫날로 이어지는 경계도 규칙을 지켜야 한다.
function isWraparoundValid(M: GenCategory[]): boolean {
  if (NIGHT.has(M[M.length - 1]) && DAWN.has(M[0])) return false;
  const combined = trailingWorkStreak(M) + leadingWorkStreak(M);
  if (combined > MAX_STREAK && combined < M.length) return false;
  if (combined >= M.length) return false; // 전부 근무일인 극단적 경우 방지
  return true;
}

export interface GeneratedPatternResult {
  days: PatternDays;
  presentSlots: boolean[];
  totalDays: number;
  employeeCount: number;
}

export interface GenerateShiftPatternOptions {
  employeeCount: number;
  cycleMultiplier?: number; // 기본 1 → D = 인원수 × 7. 2면 두 배 길이(같은 규칙 유지)
}

const MAX_ATTEMPTS = 400;

export function generateShiftPattern(
  options: GenerateShiftPatternOptions
): GeneratedPatternResult | { error: string } {
  const N = Math.floor(options.employeeCount);
  if (!Number.isFinite(N) || N < MIN_EMPLOYEES) {
    return {
      error: `근무자가 최소 ${MIN_EMPLOYEES}명 이상이어야 새벽·야간 2인1조를 유지하면서 쉬는 날도 확보할 수 있어요.`,
    };
  }

  const mult = Math.max(1, Math.floor(options.cycleMultiplier ?? 1));
  const D = N * WEEK * mult;
  const daeTarget = DAE_PER_MULTIPLIER * mult;

  let master: GenCategory[] | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate = buildMasterSequence(N, D, daeTarget);
    if (
      candidate &&
      isWraparoundValid(candidate) &&
      candidate.filter((c) => c === "대").length === daeTarget
    ) {
      master = candidate;
      break;
    }
  }

  if (!master) {
    return { error: "조건을 만족하는 패턴을 만들지 못했어요. 다시 시도해주세요." };
  }

  const days: PatternDays = Array.from({ length: D }, () => new Array<PatternCell | null>(N).fill(null));
  for (let slot = 0; slot < N; slot++) {
    for (let day = 0; day < D; day++) {
      const cat = master[(day + slot * WEEK) % D];
      const mapping = CATEGORY_TO_CELL[cat];
      days[day][slot] = { shiftType: mapping.shiftType, isMain: mapping.isMain };
    }
  }

  return { days, presentSlots: new Array(N).fill(true), totalDays: D, employeeCount: N };
}

// 생성 직후 자체 검증(운영 중인 validatePattern과 별개로, 자동 생성 결과가 스스로 내세운
// 규칙 — 하루 메·조·야·여 각 1명, 근무자별 7개 항목 개수 전원 동일 — 을 실제로 지켰는지 확인).
export function verifyGeneratedPattern(result: GeneratedPatternResult): string[] {
  const { days, employeeCount: N, totalDays } = result;
  const errors: string[] = [];
  const mult = totalDays / (N * WEEK);
  const daeTarget = DAE_PER_MULTIPLIER * mult;
  const CODE_BY_KEY: Record<string, GenCategory> = {
    "dawn:true": "메",
    "dawn:false": "조",
    "night:true": "야",
    "night:false": "여",
    "day:false": "주",
    "off:false": "휴",
    "leave:false": "대",
  };
  const codeOf = (cell: PatternCell | null) =>
    cell ? CODE_BY_KEY[`${cell.shiftType}:${cell.isMain}`] : null;

  days.forEach((row, dayIdx) => {
    const counts: Partial<Record<GenCategory, number>> = {};
    for (const cell of row) {
      const c = codeOf(cell);
      if (c) counts[c] = (counts[c] ?? 0) + 1;
    }
    for (const req of REQUIRED) {
      if ((counts[req] ?? 0) !== 1) {
        errors.push(`${dayIdx + 1}일차: '${req}'가 ${counts[req] ?? 0}개예요`);
      }
    }
    const isWeekend = WEEKEND_TRACKS.has(dayIdx % WEEK);
    if (!isWeekend && (counts["휴"] ?? 0) > 0) {
      errors.push(`${dayIdx + 1}일차(평일): '휴'가 있으면 안 돼요`);
    }
    if (isWeekend && (counts["대"] ?? 0) > 0) {
      errors.push(`${dayIdx + 1}일차(주말): '대'가 있으면 안 돼요`);
    }
    if (isWeekend && (counts["주"] ?? 0) > 0) {
      errors.push(`${dayIdx + 1}일차(주말): '주'가 있으면 안 돼요`);
    }
  });

  const perEmployeeCounts: Partial<Record<GenCategory, number>>[] = [];
  for (let slot = 0; slot < N; slot++) {
    const counts: Partial<Record<GenCategory, number>> = {};
    for (const row of days) {
      const c = codeOf(row[slot]);
      if (c) counts[c] = (counts[c] ?? 0) + 1;
    }
    perEmployeeCounts.push(counts);
  }
  const base = perEmployeeCounts[0];
  for (let slot = 1; slot < N; slot++) {
    for (const cat of [...REQUIRED, ...FREE]) {
      if ((perEmployeeCounts[slot][cat] ?? 0) !== (base[cat] ?? 0)) {
        errors.push(
          `근무자 ${slot + 1}번째의 '${cat}' 개수(${perEmployeeCounts[slot][cat] ?? 0})가 1번째(${base[cat] ?? 0})와 달라요`
        );
      }
    }
  }

  // 평일 5일근무·주말 2일휴무 기준: 근무자 1명당 '대'는 항상 8×배수개여야 한다
  // (휴는 요일 배정에서 자동으로 정해지고, 대는 목표치를 못 맞추면 여기서 걸린다).
  for (let slot = 0; slot < N; slot++) {
    const daeCount = perEmployeeCounts[slot]["대"] ?? 0;
    if (daeCount !== daeTarget) {
      errors.push(`근무자 ${slot + 1}번째의 '대' 개수(${daeCount})가 목표치(${daeTarget})와 달라요`);
    }
  }

  return errors;
}
