"use client";

import { useState } from "react";
import { useAuth, useGlobalLoading, useToast } from "@/app/providers";
import { linkWeekendCompLeave, unlinkWeekendCompLeave } from "@/lib/weekendCompLeaveLink";
import { getMonthDates, todayStr } from "@/lib/dateUtils";
import Button from "./ui/Button";

interface Props {
  open: boolean;
  onClose: () => void;
  calendarYear: number;
}

type Status = "idle" | "linking" | "done" | "error";

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export default function WeekendCompLeaveModal({ open, onClose, calendarYear }: Props) {
  const { session } = useAuth();
  const canEdit = !!session;
  const { runWithLoading } = useGlobalLoading();
  const { showToast } = useToast();

  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState(todayStr());

  const [unlinkStatus, setUnlinkStatus] = useState<Status>("idle");
  const [unlinkErrorMsg, setUnlinkErrorMsg] = useState<string | null>(null);
  const [unlinkSummary, setUnlinkSummary] = useState<string | null>(null);

  if (!open) return null;

  const selectMonth = (month: number) => {
    const dates = getMonthDates(calendarYear, month);
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
      `${startDate} ~ ${endDate} 기간에서, 주말(토/일)에 근무한 날마다 해당 주(월~금)의 대휴를 먼저 찾고, 없으면 다음 주(월~금)에서 찾아 자동 연결할까요?\n공휴일 근무는 대상에서 제외되고, 이 기간의 대휴는 기존에 연결돼 있었더라도 이번 계산 결과로 다시 정리돼요.`
    );
    if (!ok) return;

    setStatus("linking");
    setErrorMsg(null);
    setSummary(null);

    await runWithLoading("주말:대휴 연결 중...", async () => {
      const { matchedCount, unmatchedWorkCount, unlinkedCount, error } = await linkWeekendCompLeave(
        startDate,
        endDate
      );
      if (error) {
        setStatus("error");
        setErrorMsg(`연결 실패: ${error}`);
        return;
      }

      const notes = [
        unmatchedWorkCount > 0 ? `짝을 찾지 못한 주말근무 ${unmatchedWorkCount}건` : null,
        unlinkedCount > 0 ? `연결 해제된 대휴 ${unlinkedCount}건` : null,
      ].filter((n): n is string => n !== null);

      setStatus("done");
      setSummary(`${matchedCount}건 연결 완료!` + (notes.length > 0 ? ` (${notes.join(", ")})` : ""));
      showToast("연결 완료!");
    });
  };

  const handleUnlink = async () => {
    if (endDate < startDate) {
      setUnlinkErrorMsg("종료일이 시작일보다 빠를 수 없어요.");
      setUnlinkStatus("error");
      return;
    }

    const ok = window.confirm(
      `${startDate} ~ ${endDate} 기간에 사용된 대휴의 보상 원래근무일 연결을 전부 해제할까요?\n대휴 사용 기록 자체는 지워지지 않고, 연결만 풀려요.`
    );
    if (!ok) return;

    setUnlinkStatus("linking");
    setUnlinkErrorMsg(null);
    setUnlinkSummary(null);

    await runWithLoading("주말:대휴 연결 해제 중...", async () => {
      const { unlinkedCount, error } = await unlinkWeekendCompLeave(startDate, endDate);
      if (error) {
        setUnlinkStatus("error");
        setUnlinkErrorMsg(`연결 해제 실패: ${error}`);
        return;
      }

      setUnlinkStatus("done");
      setUnlinkSummary(`${unlinkedCount}건 연결 해제 완료!`);
      showToast("연결 해제 완료!");
    });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[3px] animate-[fadeIn_150ms_ease-out]" onClick={onClose} />
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
                지정한 기간에서 주말(토/일)에 근무한 날마다, 그 주(월~금) 안의 대휴를 먼저
                찾아 연결하고, 없으면 다음 주(월~금)에서 찾아 연결해요. 그래도 없으면
                연결하지 않아요. 공휴일 근무는 대상에서 제외돼요.
              </p>
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                이 기간 안의 대휴는 기존에 연결돼 있었는지와 상관없이 실행할 때마다 이 기준으로
                처음부터 다시 계산돼요. 그래서 이번 기준으로 짝이 안 맞으면 기존 연결도 바뀌거나
                풀릴 수 있어요. (기간 밖에서 이미 연결된 대휴는 건드리지 않아요.)
              </p>

              <div>
                <p className="text-xs text-black mb-1">{calendarYear}년 월 단위로 빠르게 선택</p>
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

              <div className="border-t pt-3 space-y-2">
                <p className="text-xs text-black">
                  위에서 선택한 시작일~종료일 기간에 사용된 대휴의 연결을 통째로 해제해요. 대휴
                  사용 기록 자체는 남고 보상 원래근무일 연결만 풀려요.
                </p>

                {unlinkStatus === "linking" && <p className="text-black">연결 해제 중...</p>}
                {unlinkSummary && <p className="text-green-600">{unlinkSummary}</p>}
                {unlinkErrorMsg && <p className="text-red-600">{unlinkErrorMsg}</p>}

                <Button
                  variant="danger"
                  onClick={handleUnlink}
                  disabled={unlinkStatus === "linking"}
                  className="w-full py-2"
                >
                  {unlinkStatus === "linking" ? "연결 해제 중..." : "선택 기간 연결 해제"}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
