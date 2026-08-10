"use client";

import Button from "./ui/Button";

interface Props {
  year: number;
  month: number; // 1-12
  onChange: (year: number, month: number) => void;
}

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
    <div className="flex items-center gap-3">
      <Button onClick={prev} className="px-2.5 py-1" aria-label="이전 달">
        ◀
      </Button>
      <span className="text-2xl font-semibold">
        {year}년 {month}월
      </span>
      <Button onClick={next} className="px-2.5 py-1" aria-label="다음 달">
        ▶
      </Button>
    </div>
  );
}
