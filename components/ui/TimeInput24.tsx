"use client";

interface Props {
  value: string; // "HH:mm"
  disabled?: boolean;
  onChange: (value: string) => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

const selectClass =
  "border rounded-lg px-1.5 py-1 text-sm transition-shadow duration-150 focus:outline-none focus:ring-1 focus:ring-gray-300 disabled:opacity-50";

// 브라우저 로케일에 따라 <input type="time">이 오전/오후로 표시되는 걸 피하려고
// 항상 24시간제로 보이는 시/분 드롭다운 두 개로 직접 구현한 시간 입력.
export default function TimeInput24({ value, disabled, onChange }: Props) {
  const [h, m] = (value || "00:00").split(":");
  const hour = HOURS.includes(h) ? h : "00";
  const minute = MINUTES.includes(m) ? m : "00";

  return (
    <div className="flex items-center gap-1">
      <select
        value={hour}
        disabled={disabled}
        onChange={(e) => onChange(`${e.target.value}:${minute}`)}
        className={selectClass}
      >
        {HOURS.map((hh) => (
          <option key={hh} value={hh}>
            {hh}
          </option>
        ))}
      </select>
      <span className="text-gray-400">:</span>
      <select
        value={minute}
        disabled={disabled}
        onChange={(e) => onChange(`${hour}:${e.target.value}`)}
        className={selectClass}
      >
        {MINUTES.map((mm) => (
          <option key={mm} value={mm}>
            {mm}
          </option>
        ))}
      </select>
    </div>
  );
}
