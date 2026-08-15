"use client";

import { useState } from "react";
import { useAuth, useGlobalLoading } from "@/app/providers";
import { linkWeekendCompLeave } from "@/lib/weekendCompLeaveLink";
import { getMonthDates, todayStr } from "@/lib/dateUtils";
import Button from "./ui/Button";

interface Props {
  open: boolean;
  onClose: () => void;
}

type Status = "idle" | "linking" | "done" | "error";

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export default function WeekendCompLeaveModal({ open, onClose }: Props) {
  const { session } = useAuth();
  const canEdit = !!session;
  const { runWithLoading } = useGlobalLoading();

  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState(todayStr());

  if (!open) return null;

  const thisYear = new Date().getFullYear();

  const selectMonth = (month: number) => {
    const dates = getMonthDates(thisYear, month);
    setStartDate(dates[0]);
    setEndDate(dates[dates.length - 1]);
    setErrorMsg(null);
    setSummary(null);
    setStatus("idle");
  };

  const handleLink = async () => {
    if (endDate < startDate) {
      setErrorMsg("종료일이 시작일보다 빠를 수 없어요.");
      setStatus("error");
      return;
    }

    const ok = window.confirm(
      `${startDate} ~ ${endDate} 기간에서, 주말(토/일)에 근무한 날과 아직 원래근무일이 지정되지 않은 대휴를 근무자별로 날짜가 가까운 순서로 자동 연결할까요?\n공휴일 근무는 대상에서 제외되고, 이미 연결된 대휴는 그대로 유지돼요.`
    );
    if (!ok) return;

    setStatus("linking");
    setErrorMsg(null);
    setSummary(null);

    await runWithLoading("주말:대휴 연결 중...", async () => {
      const { matchedCount, unmatchedWorkCount, error } = await linkWeekendCompLeave(
        startDate,
        endDate
      );
      if (error) {
        setStatus("error");
        setErrorMsg(`연결 실패: ${error}`);
        return;
      }

      setStatus("done");
      setSummary(
        `${matchedCount}건 연결 완료!` +
          (unmatchedWorkCount > 0 ? ` (짝을 찾지 못한 주말근무 ${unmatchedWorkCount}건 있음)` : "")
      );
    });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 animate-[fadeIn_150ms_ease-out]" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col animate-[popIn_150ms_ease-out]">
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <h2 className="font-semibold text-sm">주말:대휴 자동 연결</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-black text-lg leading-none rounded-md p-1 transition-all duration-150 hover:bg-gray-100 hover:scale-110"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
          {!canEdit ? (
            <p className="text-red-500">로그인한 사용자만 사용할 수 있어요.</p>
          ) : (
            <>
              <p className="text-xs text-black">
                지정한 기간에서 주말(토/일)에 근무한 날과 원래근무일이 비어있는 대휴를 근무자별로
                날짜가 가까운 순서로 자동 연결해요. 공휴일 근무는 제외되고, 이미 연결된 대휴는
                그대로 유지돼요.
              </p>

              <div>
                <p className="text-xs text-black mb-1">{thisYear}년 월 단위로 빠르게 선택</p>
                <div className="grid grid-cols-6 gap-1">
                  {MONTHS.map((m) => (
                    <Button key={m} onClick={() => selectMonth(m)} className="text-xs px-1 py-1.5">
                      {m}월
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <div>
                  <label className="text-xs text-blue-900 block mb-0.5">시작일</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="border rounded-lg px-2 py-1.5 text-sm transition-shadow duration-150 focus:outline-none focus:ring-1 focus:ring-gray-300"
                  />
                </div>
                <div>
                  <label className="text-xs text-blue-900 block mb-0.5">종료일</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="border rounded-lg px-2 py-1.5 text-sm transition-shadow duration-150 focus:outline-none focus:ring-1 focus:ring-gray-300"
                  />
                </div>
              </div>

              {status === "linking" && <p className="text-black">연결 중...</p>}
              {summary && <p className="text-green-600">{summary}</p>}
              {errorMsg && <p className="text-red-600">{errorMsg}</p>}

              <Button
                onClick={handleLink}
                disabled={status === "linking"}
                className="w-full py-2"
              >
                {status === "linking" ? "연결 중..." : "주말:대휴 적용"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
