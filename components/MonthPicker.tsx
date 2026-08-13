"use client";

import Button from "./ui/Button";

interface Props {
  year: number;
  month: number; // 1-12
  onChange: (year: number, month: number) => void;
}

// 실제 현재 연도를 기준으로 앞뒤 넉넉히 잡되, 지금 선택된 연도가 이 범위를 벗어나면
// (아주 먼 과거/미래로 이동해 있던 경우) 드롭다운에서도 선택할 수 있게 범위를 넓혀준다.
function yearOptions(selectedYear: number): number[] {
  const thisYear = new Date().getFullYear();
  const from = Math.min(thisYear - 5, selectedYear);
  const to = Math.max(thisYear + 5, selectedYear);
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

const selectClass =
  "text-lg font-semibold border rounded-lg px-2 py-1 bg-white cursor-pointer transition-shadow duration-150 focus:outline-none focus:ring-1 focus:ring-gray-300";

export default function MonthPicker({ year, month, onChange }: Props) {
  const prev = () => {
    if (month === 1) onChange(year - 1, 12);
    else onChange(year, month - 1);
  };
  const next = () => {
    if (month === 12) onChange(year + 1, 1);
    else onChange(year, month + 1);
  };

  return (
    <div className="flex items-center gap-2">
      <Button onClick={prev} className="px-2.5 py-1" aria-label="이전 달">
        ◀
      </Button>
      <select
        value={year}
        onChange={(e) => onChange(Number(e.target.value), month)}
        aria-label="연도 선택"
        className={selectClass}
      >
        {yearOptions(year).map((y) => (
          <option key={y} value={y}>
            {y}년
          </option>
        ))}
      </select>
      <select
        value={month}
        onChange={(e) => onChange(year, Number(e.target.value))}
        aria-label="월 선택"
        className={selectClass}
      >
        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
          <option key={m} value={m}>
            {m}월
          </option>
        ))}
      </select>
      <Button onClick={next} className="px-2.5 py-1" aria-label="다음 달">
        ▶
      </Button>
    </div>
  );
}
