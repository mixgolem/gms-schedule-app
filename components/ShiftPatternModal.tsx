"use client";

import { useState } from "react";
import { addDays, differenceInCalendarDays, format } from "date-fns";
import { useAuth, useGlobalLoading } from "@/app/providers";
import { useEmployees } from "@/lib/useEmployees";
import { useShiftDefaults } from "@/lib/useShiftDefaults";
import { useShiftPattern } from "@/lib/useShiftPattern";
import {
  parsePatternFile,
  validatePattern,
  PatternDays,
  PATTERN_DAYS,
} from "@/lib/shiftPatternImport";
import { generatePatternRows, applyPatternRows } from "@/lib/shiftPatternApply";
import { linkWeekendCompLeave } from "@/lib/weekendCompLeaveLink";
import { employeeLabel } from "@/lib/types";
import { todayStr, parseLocalDate } from "@/lib/dateUtils";
import Button from "./ui/Button";

interface Props {
  open: boolean;
  onClose: () => void;
}

type Status = "idle" | "parsing" | "parsed" | "saving" | "applying" | "linking" | "done" | "error";

// 미리보기에서 원래 엑셀에 적었던 한 글자 코드로 다시 보여주기 위한 역매핑
const PREVIEW_CODE: Record<string, string> = {
  "dawn:true": "메",
  "dawn:false": "조",
  "night:true": "야",
  "night:false": "여",
  "day:false": "주",
  "off:false": "휴",
  "leave:false": "대",
};

const DEFAULT_CYCLES = 1; // 49일 × 1회

export default function ShiftPatternModal({ open, onClose }: Props) {
  const { session } = useAuth();
  const canEdit = !!session;
  const { employees } = useEmployees();
  const { defaults: shiftDefaults } = useShiftDefaults();
  const { current, latestApplication, uploadPattern, recordApplication } = useShiftPattern();
  const { runWithLoading } = useGlobalLoading();

  const [status, setStatus] = useState<Status>("idle");
  const [parsedDays, setParsedDays] = useState<PatternDays | null>(null);
  const [parsedPresentSlots, setParsedPresentSlots] = useState<boolean[]>([]);
  const [parsedFilename, setParsedFilename] = useState<string>("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const [startDate, setStartDate] = useState(todayStr());
  const [cycles, setCycles] = useState(DEFAULT_CYCLES);
  const [linkStartDate, setLinkStartDate] = useState(todayStr());
  const [linkEndDate, setLinkEndDate] = useState(todayStr());

  if (!open) return null;

  const activePattern = parsedDays ?? current?.days ?? null;
  const activePresentSlots = parsedDays ? parsedPresentSlots : current?.presentSlots ?? [];
  const activeFilename = parsedDays ? parsedFilename : current?.filename ?? "";

  const reset = () => {
    setStatus("idle");
    setParsedDays(null);
    setParsedPresentSlots([]);
    setParsedFilename("");
    setWarnings([]);
    setValidationErrors([]);
    setErrorMsg(null);
    setSummary(null);
    setInputKey((k) => k + 1);
  };

  const handleFile = async (file: File) => {
    if (!canEdit) return;
    setStatus("parsing");
    setErrorMsg(null);
    setSummary(null);

    const result = await parsePatternFile(file, employees);
    if (result.days.length < PATTERN_DAYS) {
      setStatus("error");
      setErrorMsg(result.warnings[0] ?? "패턴을 읽지 못했어요.");
      return;
    }

    setParsedDays(result.days);
    setParsedPresentSlots(result.presentSlots);
    setParsedFilename(file.name);
    setWarnings(result.warnings);
    setValidationErrors(validatePattern(result.days, result.presentSlots));
    setStatus("parsed");
  };

  const handleSavePattern = async () => {
    if (!parsedDays || validationErrors.length > 0) return;
    setStatus("saving");
    const { error } = await uploadPattern(parsedFilename, parsedDays, parsedPresentSlots);
    if (error) {
      setStatus("error");
      setErrorMsg(`패턴 저장 실패: ${error}`);
      return;
    }
    setParsedDays(null);
    setParsedPresentSlots([]);
    setParsedFilename("");
    setStatus("idle");
    setSummary("패턴이 저장됐어요. 아래에서 적용할 날짜를 선택해주세요.");
  };

  const totalDays = Math.max(1, cycles) * PATTERN_DAYS;
  const endDate = format(addDays(parseLocalDate(startDate), totalDays - 1), "yyyy-MM-dd");

  const handleApply = async () => {
    if (!activePattern) return;
    const { rows, clearedCells } = generatePatternRows(
      activePattern,
      activePresentSlots,
      employees,
      startDate,
      endDate,
      shiftDefaults
    );
    if (rows.length === 0 && clearedCells.length === 0) {
      setErrorMsg("적용할 근무 데이터가 없어요.");
      setStatus("error");
      return;
    }

    const ok = window.confirm(
      `${startDate} ~ ${endDate} 기간에 이 패턴을 적용할까요?\n이 기간에 이미 있던 근무 기록은 지워지고 패턴 내용으로 대체돼요(빈칸인 근무자·날짜는 새로 채워지지 않고 기존 기록만 삭제돼요). 되돌릴 수 없어요.`
    );
    if (!ok) return;

    setStatus("applying");
    setErrorMsg(null);

    await runWithLoading("근무패턴 적용 중...", async () => {
      const { error } = await applyPatternRows(rows, clearedCells);
      if (error) {
        setStatus("error");
        setErrorMsg(`적용 실패: ${error}`);
        return;
      }

      await recordApplication(current?.id ?? null, startDate, endDate);

      setStatus("done");
      const clearedNote = clearedCells.length > 0 ? ` (빈칸 ${clearedCells.length}건 삭제)` : "";
      setSummary(`${startDate} ~ ${endDate} 기간에 ${rows.length}건 적용 완료!${clearedNote}`);
    });
  };

  const handleLinkWeekendCompLeave = async () => {
    if (linkEndDate < linkStartDate) {
      setErrorMsg("종료일이 시작일보다 빠를 수 없어요.");
      setStatus("error");
      return;
    }

    const ok = window.confirm(
      `${linkStartDate} ~ ${linkEndDate} 기간에서, 주말(토/일)에 근무한 날과 아직 원래근무일이 지정되지 않은 대휴를 근무자별로 날짜가 가까운 순서로 자동 연결할까요?\n공휴일 근무는 대상에서 제외되고, 이미 연결된 대휴는 그대로 유지돼요.`
    );
    if (!ok) return;

    setStatus("linking");
    setErrorMsg(null);
    setSummary(null);

    await runWithLoading("주말:대휴 연결 중...", async () => {
      const { matchedCount, unmatchedWorkCount, error } = await linkWeekendCompLeave(
        linkStartDate,
        linkEndDate
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
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col animate-[popIn_150ms_ease-out]">
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <h2 className="font-semibold text-sm">근무패턴 관리</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-lg leading-none rounded-md p-1 transition-all duration-150 hover:bg-gray-100 hover:scale-110"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
          {!canEdit ? (
            <p className="text-red-500">로그인한 사용자만 관리할 수 있어요.</p>
          ) : (
            <>
              {current && !parsedDays && (
                <div className="text-xs text-gray-700 bg-gray-50 border rounded-lg px-3 py-2">
                  <p className="font-medium text-gray-900 mb-0.5">현재 등록된 패턴</p>
                  <p>파일명: {current.filename}</p>
                  <p>업로더: {current.uploadedByEmail ?? "알 수 없음"}</p>
                  <p>업로드 시각: {new Date(current.uploadedAt).toLocaleString("ko-KR")}</p>
                </div>
              )}

              {latestApplication && !parsedDays && (
                <div className="bg-blue-900 text-white rounded-lg px-4 py-3">
                  <p className="text-sm font-bold">이전 적용기록</p>
                  <p className="text-xl font-extrabold mt-1">
                    총{" "}
                    {differenceInCalendarDays(
                      parseLocalDate(latestApplication.endDate),
                      parseLocalDate(latestApplication.startDate)
                    ) + 1}
                    일 적용
                  </p>
                  <p className="text-base font-bold mt-1">
                    시작일: {latestApplication.startDate} &nbsp;&nbsp; 종료일:{" "}
                    {latestApplication.endDate}
                  </p>
                  <p className="text-xs text-blue-200 mt-1.5">
                    적용: {latestApplication.appliedByEmail ?? "알 수 없음"} ·{" "}
                    {new Date(latestApplication.appliedAt).toLocaleString("ko-KR")}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <p className="text-xs text-gray-900">
                  A열: 참고용(무시), B열부터 1행에 근무자 글자(A,B,C...)를 적고 2행부터{" "}
                  {PATTERN_DAYS}행까지 {PATTERN_DAYS}일치 패턴(메/조/야/여/주/휴/대)이 담긴 .xlsx를
                  올려주세요. 열 순서는 상관없이 1행 글자로 매칭되고, 인원수 제한도 없어요.
                </p>
                <div className="text-xs text-gray-700 bg-gray-50 border rounded-lg px-3 py-2 leading-relaxed">
                  <p className="font-medium text-gray-900 mb-0.5">검증 기준</p>
                  <p>· 하루(행)마다 메·조·야·여가 각각 정확히 1개씩</p>
                  <p>· 근무자(열)별 49일 동안 메·조·야·여·주 각 7개, 대 8개, 휴 6개</p>
                </div>
                {(status === "idle" || status === "parsing" || status === "error") && (
                  <input
                    key={inputKey}
                    type="file"
                    accept=".xlsx"
                    onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                    disabled={status === "parsing"}
                    className="text-sm text-gray-500 disabled:opacity-50 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border file:border-gray-300 file:bg-white file:text-sm file:font-medium file:text-gray-700 file:cursor-pointer file:transition-all file:duration-150 hover:file:bg-gray-100 hover:file:border-gray-400"
                  />
                )}
              </div>

              {status === "parsing" && <p className="text-gray-600">읽는 중...</p>}
              {(status === "saving" || status === "applying" || status === "linking") && (
                <p className="text-gray-600">
                  {status === "saving" ? "저장 중..." : status === "applying" ? "적용 중..." : "연결 중..."}
                </p>
              )}
              {summary && <p className="text-green-600">{summary}</p>}
              {errorMsg && <p className="text-red-600">{errorMsg}</p>}
              {status === "error" && (
                <Button onClick={reset} className="text-xs px-2 py-1">
                  다시 시도
                </Button>
              )}

              {parsedDays && validationErrors.length === 0 && (
                <p className="text-xs font-medium text-green-700 bg-green-50 border border-green-300 rounded-lg px-3 py-2">
                  ✓ {parsedPresentSlots.filter(Boolean).length}명 49일 검증 결과 이상 없음
                </p>
              )}

              {validationErrors.length > 0 && parsedDays && (
                <div className="border border-red-300 bg-red-50 rounded-lg p-2 max-h-40 overflow-y-auto">
                  <p className="text-xs font-medium text-red-800 mb-1">
                    패턴이 유효하지 않아요 ({validationErrors.length}건) — 하루에 메/조/야/여가
                    각각 1개씩, 근무자별로 메·조·야·여·주 7개씩·대 8개·휴 6개가 되어야 해요.
                  </p>
                  <ul className="text-xs text-red-700 space-y-0.5">
                    {validationErrors.slice(0, 50).map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {warnings.length > 0 && parsedDays && (
                <div className="border border-amber-300 bg-amber-50 rounded-lg p-2 max-h-32 overflow-y-auto">
                  <p className="text-xs font-medium text-amber-800 mb-1">확인 필요 {warnings.length}건</p>
                  <ul className="text-xs text-amber-700 space-y-0.5">
                    {warnings.slice(0, 30).map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {parsedDays && (
                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    onClick={handleSavePattern}
                    disabled={validationErrors.length > 0}
                    className="flex-1 py-2"
                  >
                    {validationErrors.length > 0 ? "패턴이 유효하지 않아 저장 불가" : "이 패턴 저장"}
                  </Button>
                  <Button onClick={reset} className="py-2">
                    취소
                  </Button>
                </div>
              )}

              {activePattern && !parsedDays && (
                <>
                  <div className="border rounded-lg overflow-auto max-h-56">
                    <table className="text-xs w-full">
                      <thead className="sticky top-0 bg-gray-50">
                        <tr>
                          <th className="px-2 py-1 text-left border-b whitespace-nowrap">일차</th>
                          {Array.from({ length: activePattern[0]?.length ?? 0 }, (_, i) => (
                            <th
                              key={i}
                              className={`px-2 py-1 text-left border-b whitespace-nowrap ${
                                activePresentSlots[i] ? "" : "text-gray-300"
                              }`}
                              title={activePresentSlots[i] ? undefined : "이 패턴에 없는 자리"}
                            >
                              {employeeLabel(i)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {activePattern.map((row, i) => (
                          <tr key={i} className="border-b last:border-b-0">
                            <td className="px-2 py-1 whitespace-nowrap text-gray-500">{i + 1}</td>
                            {row.map((cell, ci) => (
                              <td key={ci} className="px-2 py-1 text-center">
                                {cell ? PREVIEW_CODE[`${cell.shiftType}:${cell.isMain}`] ?? "?" : ""}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="space-y-2 border-t pt-3">
                    <p className="text-xs font-medium text-gray-900">
                      &quot;{activeFilename}&quot; 패턴 적용
                    </p>
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
                        <label className="text-xs text-blue-900 block mb-0.5">
                          패턴 반복 횟수 ({PATTERN_DAYS}일 × N회)
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={cycles}
                          onChange={(e) => setCycles(Number(e.target.value))}
                          className="w-20 border rounded-lg px-2 py-1.5 text-sm transition-shadow duration-150 focus:outline-none focus:ring-1 focus:ring-gray-300"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-gray-600">
                      총 {totalDays}일 적용 · 종료일: {endDate}
                    </p>
                    <Button
                      variant="danger"
                      onClick={handleApply}
                      disabled={status === "applying"}
                      className="w-full py-2"
                    >
                      {status === "applying" ? "적용 중..." : "적용"}
                    </Button>
                  </div>
                </>
              )}

              {!parsedDays && (
                <div className="space-y-2 border-t pt-3">
                  <p className="text-xs font-medium text-gray-900">주말근무 ↔ 대휴 자동 연결</p>
                  <p className="text-xs text-gray-600">
                    지정한 기간에서 주말(토/일)에 근무한 날과 원래근무일이 비어있는 대휴를
                    근무자별로 날짜가 가까운 순서로 자동 연결해요. 공휴일 근무는 제외되고, 이미
                    연결된 대휴는 그대로 유지돼요.
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div>
                      <label className="text-xs text-blue-900 block mb-0.5">시작일</label>
                      <input
                        type="date"
                        value={linkStartDate}
                        onChange={(e) => setLinkStartDate(e.target.value)}
                        className="border rounded-lg px-2 py-1.5 text-sm transition-shadow duration-150 focus:outline-none focus:ring-1 focus:ring-gray-300"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-blue-900 block mb-0.5">종료일</label>
                      <input
                        type="date"
                        value={linkEndDate}
                        onChange={(e) => setLinkEndDate(e.target.value)}
                        className="border rounded-lg px-2 py-1.5 text-sm transition-shadow duration-150 focus:outline-none focus:ring-1 focus:ring-gray-300"
                      />
                    </div>
                  </div>
                  <Button
                    onClick={handleLinkWeekendCompLeave}
                    disabled={status === "linking"}
                    className="w-full py-2"
                  >
                    {status === "linking" ? "연결 중..." : "주말:대휴 적용"}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
