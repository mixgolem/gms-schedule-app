"use client";

import { useState } from "react";
import { useAuth, useGlobalLoading } from "@/app/providers";
import { useEmployees } from "@/lib/useEmployees";
import {
  parseScheduleFile,
  applyParsedSchedule,
  ParseResult,
} from "@/lib/scheduleImport";
import { weekdayLabel } from "@/lib/dateUtils";
import { employeeLabel } from "@/lib/types";
import Button from "./ui/Button";

interface Props {
  open: boolean;
  onClose: () => void;
}

type Status = "idle" | "parsing" | "parsed" | "saving" | "done" | "error";

function formatDate(dateStr: string): string {
  return `${Number(dateStr.slice(5, 7))}/${Number(dateStr.slice(8, 10))}(${weekdayLabel(dateStr)})`;
}

export default function UploadScheduleModal({ open, onClose }: Props) {
  const { session } = useAuth();
  const canEdit = !!session;
  const { employees } = useEmployees();
  const { runWithLoading } = useGlobalLoading();
  const [status, setStatus] = useState<Status>("idle");
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);

  if (!open) return null;

  const reset = () => {
    setStatus("idle");
    setParsed(null);
    setSummary(null);
    setErrorMsg(null);
    setInputKey((k) => k + 1); // 같은 파일 다시 선택 가능하도록 input 리마운트
  };

  const handleFile = async (file: File) => {
    if (!canEdit) return;
    setStatus("parsing");
    setSummary(null);
    setErrorMsg(null);

    const result = await parseScheduleFile(file, employees);
    setParsed(result);

    if (result.rows.length === 0 && result.clearedCells.length === 0) {
      setStatus("error");
      setErrorMsg("반영할 데이터가 없어요. 양식을 확인해주세요.");
      return;
    }

    setStatus("parsed");
  };

  const handleApply = async () => {
    if (!parsed) return;
    setStatus("saving");

    await runWithLoading("근무표 반영 중...", async () => {
      const { error } = await applyParsedSchedule(parsed.rows, parsed.clearedCells);
      if (error) {
        setStatus("error");
        setErrorMsg(`저장 실패: ${error}`);
        return;
      }

      const dates = new Set(parsed.rows.map((r) => r.work_date));
      const clearedNote =
        parsed.clearedCells.length > 0 ? ` · 빈칸 ${parsed.clearedCells.length}건 삭제` : "";
      setSummary(`${dates.size}일 · ${parsed.rows.length}건 반영 완료${clearedNote}`);
      setStatus("done");
      setParsed(null);
    });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 animate-[fadeIn_150ms_ease-out]" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col animate-[popIn_150ms_ease-out]">
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <h2 className="font-semibold text-sm">근무표 업로드</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-lg leading-none rounded-md p-1 transition-all duration-150 hover:bg-gray-100 hover:scale-110"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
          {!canEdit ? (
            <p className="text-red-500">로그인한 사용자만 업로드할 수 있어요.</p>
          ) : (
            <>
              <p className="text-xs text-gray-500">
                A열: 날짜, B열부터 1행에 근무자 글자(A,B,C...)를 적고 그 아래 근무코드(메/조/야/여/주/휴/대)를
                채운 .xlsx 양식을 올려주세요. 열 순서는 상관없이 1행 글자로 매칭되고, 인원수
                제한도 없어요. 아래에서 날짜·직원 매칭을 확인한 뒤 &quot;적용&quot;을 눌러야
                실제로 반영됩니다. 칸을 비워두면 그 근무자의 그 날짜 기존 근무 기록이 삭제돼요.
              </p>

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
            </>
          )}

          {status === "parsing" && <p className="text-gray-600">읽는 중...</p>}
          {status === "saving" && <p className="text-gray-600">저장 중...</p>}
          {status === "done" && summary && <p className="text-green-600">{summary}</p>}
          {status === "error" && errorMsg && <p className="text-red-600">{errorMsg}</p>}

          {status === "done" && (
            <Button onClick={reset} className="text-xs px-2 py-1">
              다른 파일 업로드
            </Button>
          )}

          {parsed && (status === "parsed" || status === "saving") && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-600">
                미리보기 — 날짜와 A~G 매칭을 확인해주세요
              </p>
              <div className="border rounded-lg overflow-auto max-h-64">
                <table className="text-xs w-full">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr>
                      <th className="px-2 py-1 text-left border-b whitespace-nowrap">날짜</th>
                      {parsed.employeeNames.map((name, i) => (
                        <th key={i} className="px-2 py-1 text-left border-b whitespace-nowrap">
                          {employeeLabel(i)}
                          <br />
                          <span className="text-gray-400 font-normal">{name ?? "(없음)"}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.preview.map((row) => (
                      <tr
                        key={row.date}
                        className="border-b last:border-b-0 transition-colors duration-150 hover:bg-gray-100"
                      >
                        <td className="px-2 py-1 whitespace-nowrap">{formatDate(row.date)}</td>
                        {row.codes.map((code, i) => (
                          <td key={i} className="px-2 py-1 text-center">
                            {code ?? ""}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="primary"
                  onClick={handleApply}
                  disabled={status === "saving"}
                  className="flex-1 py-2"
                >
                  {status === "saving" ? "저장 중..." : "적용"}
                </Button>
                <Button onClick={reset} disabled={status === "saving"} className="py-2">
                  취소
                </Button>
              </div>
            </div>
          )}

          {parsed && parsed.warnings.length > 0 && (
            <div className="border border-amber-300 bg-amber-50 rounded-lg p-2 max-h-40 overflow-y-auto">
              <p className="text-xs font-medium text-amber-800 mb-1">
                건너뛴 항목 {parsed.warnings.length}건
              </p>
              <ul className="text-xs text-amber-700 space-y-0.5">
                {parsed.warnings.slice(0, 30).map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
