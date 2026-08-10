// 새벽/야간처럼 자정을 넘기는 근무시간과, 그 안에서 부분적으로 쓰는 연차/대휴 구간을 다루기 위한 헬퍼.
// 모든 시각은 "HH:mm" 문자열로 주고받고, 내부적으로는 분 단위 정수로 정규화해서 비교한다.

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

function minutesToHHmm(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

// end가 start보다 같거나 이르면 자정을 넘긴 것으로 보고 1440분을 더한다.
function normalizeRange(start: string, end: string): [number, number] {
  const s = toMinutes(start);
  let e = toMinutes(end);
  if (e <= s) e += 1440;
  return [s, e];
}

export interface LabeledRange {
  start: string;
  end: string;
  label: string;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

// 부분사용 항목들이 기본 근무시간 범위 안에 있고, 서로 겹치지 않는지 검사
export function validateSubRanges(
  base: { start: string; end: string },
  entries: LabeledRange[]
): ValidationResult {
  if (entries.length === 0) return { valid: true };

  const [baseS, baseE] = normalizeRange(base.start, base.end);
  const normalized = entries.map((e) => ({ ...e, range: normalizeRange(e.start, e.end) }));

  for (const e of normalized) {
    const [s, en] = e.range;
    if (s >= en) {
      return { valid: false, error: `${e.label}: 시작시각이 종료시각보다 빠르거나 같아요` };
    }
    if (s < baseS || en > baseE) {
      return {
        valid: false,
        error: `${e.label}: 기본 근무시간(${base.start}~${base.end}) 범위를 벗어났어요`,
      };
    }
  }

  const sorted = [...normalized].sort((a, b) => a.range[0] - b.range[0]);
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].range[1] > sorted[i + 1].range[0]) {
      return {
        valid: false,
        error: `${sorted[i].label}와(과) ${sorted[i + 1].label} 시간이 서로 겹쳐요`,
      };
    }
  }

  return { valid: true };
}

// 기본 근무시간에서 부분사용 구간들을 뺀 나머지 실제 근무 구간(들)
export function computeRemainingRanges(
  base: { start: string; end: string },
  entries: { start: string; end: string }[]
): { start: string; end: string }[] {
  const [baseS, baseE] = normalizeRange(base.start, base.end);
  const used = entries.map((e) => normalizeRange(e.start, e.end)).sort((a, b) => a[0] - b[0]);

  const remaining: [number, number][] = [];
  let cursor = baseS;
  for (const [s, e] of used) {
    if (s > cursor) remaining.push([cursor, Math.min(s, baseE)]);
    cursor = Math.max(cursor, e);
  }
  if (cursor < baseE) remaining.push([cursor, baseE]);

  return remaining
    .filter(([s, e]) => e > s)
    .map(([s, e]) => ({ start: minutesToHHmm(s), end: minutesToHHmm(e) }));
}
