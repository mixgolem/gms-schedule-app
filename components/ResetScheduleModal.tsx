"use client";

import { useState } from "react";
import { useAuth, useGlobalLoading, useToast } from "@/app/providers";
import { countScheduleRange, deleteScheduleRange } from "@/lib/resetSchedule";
import { getMonthDates, todayStr } from "@/lib/dateUtils";
import Button from "./ui/Button";
import ConfirmPhraseDialog from "./ConfirmPhraseDialog";

interface Props {
  open: boolean;
  onClose: () => void;
  calendarYear: number;
}

type Status = "idle" | "counting" | "resetting" | "done" | "error";

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export default function ResetScheduleModal({ open, onClose, calendarYear }: Props) {
  const { session } = useAuth();
  const canEdit = !!session;
  const { runWithLoading } = useGlobalLoading();
  const { showToast } = useToast();

  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState(todayStr());
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  if (!open) return null;

  const selectMonth = (month: number) => {
    const dates = getMonthDates(calendarYear, month);
    setStartDate(dates[0]);
    setEndDate(dates[dates.length - 1]);
    setErrorMsg(null);
    setSummary(null);
    setStatus("idle");
  };

  const handleStart = async () => {
    if (endDate < startDate) {
      setErrorMsg("종료일이 시작일보다 빠를 수 없어요.");
      setStatus("error");
      return;
    }

    setStatus("counting");
    setErrorMsg(null);
    setSummary(null);

    const { count, error } = await countScheduleRange(startDate, endDate);
    if (error) {
      setStatus("error");
      setErrorMsg(`확인 실패: ${error}`);
      return;
    }
    if (count === 0) {
      setStatus("done");
      setSummary("이 기간에 삭제할 근무 기록이 없어요.");
      return;
    }

    setPendingCount(count);
    setStatus("idle");
    setConfirmOpen(true);
  };

  const handleConfirm = async () => {
    setConfirmOpen(false);
    setStatus("resetting");

    await runWithLoading("근무표 초기화 중...", async () => {
      const { error } = await deleteScheduleRange(startDate, endDate);
      if (error) {
        setStatus("error");
        setErrorMsg(`초기화 실패: ${error}`);
        return;
      }
      setStatus("done");
      setSummary(`${pendingCount}건 삭제 완료!`);
      showToast("삭제 완료!");
    });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[3px] animate-[fadeIn_150ms_ease-out]" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col animate-[popIn_150ms_ease-out]">
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <h2 className="font-semibold text-sm">근무표 기간 초기화</h2>
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
                지정한 기간의 근무 기록만 삭제해요. 직원·공휴일·근무패턴 등 다른 데이터는
                그대로 남고, 삭제된 근무 기록은 되돌릴 수 없어요.
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
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      setErrorMsg(null);
                      setSummary(null);
                    }}
                    className="border rounded-lg px-2 py-1.5 text-sm transition-shadow duration-150 focus:outline-none focus:ring-1 focus:ring-gray-300"
                  />
                </div>
                <div>
                  <label className="text-xs text-blue-900 block mb-0.5">종료일</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      setErrorMsg(null);
                      setSummary(null);
                    }}
                    className="border rounded-lg px-2 py-1.5 text-sm transition-shadow duration-150 focus:outline-none focus:ring-1 focus:ring-gray-300"
                  />
                </div>
              </div>

              {status === "counting" && <p className="text-black">확인 중...</p>}
              {status === "resetting" && <p className="text-black">초기화 중...</p>}
              {summary && <p className="text-green-600">{summary}</p>}
              {errorMsg && <p className="text-red-600">{errorMsg}</p>}

              <Button
                variant="danger"
                onClick={handleStart}
                disabled={status === "counting" || status === "resetting"}
                className="w-full py-2"
              >
                {status === "counting"
                  ? "확인 중..."
                  : status === "resetting"
                  ? "초기화 중..."
                  : "이 기간 초기화"}
              </Button>
            </>
          )}
        </div>
      </div>

      <ConfirmPhraseDialog
        open={confirmOpen}
        title={`${startDate} ~ ${endDate} 근무표 초기화`}
        message={`이 기간의 근무 기록 ${pendingCount}건이 삭제되며 되돌릴 수 없어요.\n직원·공휴일·근무패턴 등 다른 데이터는 그대로 남아요.`}
        phrase="근무표초기화"
        danger
        onConfirm={handleConfirm}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
