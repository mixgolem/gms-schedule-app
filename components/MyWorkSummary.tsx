"use client";

import { ReactNode, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Employee, Shift, SHIFT_LABELS } from "@/lib/types";
import { todayStr, weekdayLabel } from "@/lib/dateUtils";
import { useAnnualLeaveLedger } from "@/lib/useAnnualLeaveLedger";
import { useCompLeaveLedger } from "@/lib/useCompLeaveLedger";

interface Props {
  employees: Employee[];
  myEmployeeId: string | null;
  onChangeMyEmployee: (id: string | null) => void;
  // 근무표가 실시간으로 다시 불러와질 때마다 바뀌는 값 — 내 오늘·다음 근무도 같이 새로 읽는다
  refreshKey: unknown;
}

const HIDE_PROMPT_KEY = "gms.hideMyWorkPrompt";

type MyShift = Pick<Shift, "work_date" | "shift_type" | "is_main" | "start_time" | "end_time">;

function isWork(type: string): boolean {
  return type === "dawn" || type === "day" || type === "night";
}

function formatShift(s: MyShift): string {
  const date = `${Number(s.work_date.slice(5, 7))}/${Number(s.work_date.slice(8, 10))}(${weekdayLabel(s.work_date)})`;
  const time =
    isWork(s.shift_type) && s.start_time && s.end_time
      ? ` ${s.start_time.slice(0, 5)}~${s.end_time.slice(0, 5)}`
      : "";
  return `${date} ${s.is_main ? "★" : ""}${SHIFT_LABELS[s.shift_type]}${time}`;
}

function EmployeeSelect({
  employees,
  value,
  onChange,
}: {
  employees: Employee[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className="border border-blue-900 rounded-md px-1.5 py-0.5 text-sm font-bold text-blue-950 bg-white"
      title="나는 누구인지 골라두면 내 근무 요약이 떠요"
    >
      <option value="">{value ? "선택 안 함" : "내 이름 선택"}</option>
      {employees.map((e) => (
        <option key={e.id} value={e.id}>
          {e.name}
        </option>
      ))}
    </select>
  );
}

// 근무표 위 한 줄짜리 "내 근무" 요약. 계정마다 "나는 이 직원"을 골라두면(본인 설정에 저장)
// 오늘 근무·다음 근무·남은 연차·사용 가능 대휴를 보여준다. 보고 있는 달과 상관없이 오늘 기준.
export default function MyWorkSummary({ employees, myEmployeeId, onChangeMyEmployee, refreshKey }: Props) {
  const [promptHidden, setPromptHidden] = useState(false);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPromptHidden(localStorage.getItem(HIDE_PROMPT_KEY) === "1");
    } catch {
      // 저장소를 못 쓰는 환경이면 그냥 안내를 보여준다
    }
  }, []);

  const me = employees.find((e) => e.id === myEmployeeId);

  if (!me) {
    if (promptHidden) return null;
    return (
      <div className="flex items-center gap-2 flex-wrap rounded-lg border border-dashed border-blue-300 bg-blue-50/50 px-3 py-1.5 text-sm text-black">
        <span aria-hidden>👤</span>
        <span>내 이름을 골라두면 오늘·다음 근무와 남은 연차·대휴가 여기 떠요</span>
        <EmployeeSelect employees={employees} value={null} onChange={onChangeMyEmployee} />
        <button
          type="button"
          onClick={() => {
            setPromptHidden(true);
            try {
              localStorage.setItem(HIDE_PROMPT_KEY, "1");
            } catch {
              // 무시
            }
          }}
          className="ml-auto text-xs text-black/60 rounded-md px-1.5 py-0.5 hover:bg-blue-100"
          title="이 안내 숨기기 (이 브라우저에서만)"
        >
          ✕ 숨기기
        </button>
      </div>
    );
  }

  return (
    <MySummaryLine
      key={me.id}
      me={me}
      employees={employees}
      onChangeMyEmployee={onChangeMyEmployee}
      refreshKey={refreshKey}
    />
  );
}

function MySummaryLine({
  me,
  employees,
  onChangeMyEmployee,
  refreshKey,
}: {
  me: Employee;
  employees: Employee[];
  onChangeMyEmployee: (id: string | null) => void;
  refreshKey: unknown;
}) {
  const today = todayStr();
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const { rows: annualRows } = useAnnualLeaveLedger(year, month);
  const { rows: compRows } = useCompLeaveLedger(year, month);
  const [upcoming, setUpcoming] = useState<MyShift[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("shifts")
      .select("work_date, shift_type, is_main, start_time, end_time")
      .eq("employee_id", me.id)
      .gte("work_date", today)
      .order("work_date")
      .limit(20)
      .then(({ data }) => {
        if (!cancelled) setUpcoming(data ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [me.id, today, refreshKey]);

  const todayShift = upcoming?.find((s) => s.work_date === today) ?? null;
  const nextWork = upcoming?.find((s) => s.work_date > today && isWork(s.shift_type)) ?? null;
  const annual = annualRows.find((r) => r.employeeId === me.id);
  const comp = compRows.find((r) => r.employeeId === me.id);

  return (
    <div className="flex items-center gap-x-4 gap-y-1 flex-wrap rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-1.5 text-sm text-black">
      <span className="flex items-center gap-1.5">
        <span aria-hidden>👤</span>
        <span className="font-bold text-blue-950">내 근무</span>
        <EmployeeSelect employees={employees} value={me.id} onChange={onChangeMyEmployee} />
      </span>
      <Item label="오늘">
        {upcoming === null ? "…" : todayShift ? formatShift(todayShift) : "배정 없음"}
      </Item>
      <Item label="다음 근무">{upcoming === null ? "…" : nextWork ? formatShift(nextWork) : "아직 없음"}</Item>
      <Item label="남은 연차">{annual ? annual.remainingDaysLabel : "…"}</Item>
      <Item label="사용 가능 대휴">{comp ? comp.availableLabel : "…"}</Item>
    </div>
  );
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="whitespace-nowrap">
      <span className="text-xs text-blue-900 mr-1">{label}</span>
      <span className="font-semibold">{children}</span>
    </span>
  );
}
