"use client";

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
      <button onClick={prev} className="px-2 py-1 border rounded hover:bg-gray-50">
        ◀
      </button>
      <span className="text-2xl font-semibold">
        {year}년 {month}월
      </span>
      <button onClick={next} className="px-2 py-1 border rounded hover:bg-gray-50">
        ▶
      </button>
    </div>
  );
}
