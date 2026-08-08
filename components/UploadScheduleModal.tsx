"use client";

import { useState } from "react";
import { useAuth } from "@/app/providers";
import { useEmployees } from "@/lib/useEmployees";
import { parseScheduleFile, applyParsedSchedule } from "@/lib/scheduleImport";

interface Props {
  open: boolean;
  onClose: () => void;
}

type Status = "idle" | "parsing" | "saving" | "done" | "error";

export default function UploadScheduleModal({ open, onClose }: Props) {
  const { session } = useAuth();
  const canEdit = !!session;
  const { employees } = useEmployees();
  const [warnings, setWarnings] = useState<string[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [summary, setSummary] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!open) return null;

  const handleFile = async (file: File) => {
    if (!canEdit) return;
    setStatus("parsing");
    setWarnings([]);
    setSummary(null);
    setErrorMsg(null);

    const { rows, warnings: parseWarnings } = await parseScheduleFile(file, employees);
    setWarnings(parseWarnings);

    if (rows.length === 0) {
      setStatus("error");
      setErrorMsg("반영할 데이터가 없어요. 양식을 확인해주세요.");
      return;
    }

    setStatus("saving");
    const { error } = await applyParsedSchedule(rows);
    if (error) {
      setStatus("error");
      setErrorMsg(`저장 실패: ${error}`);
      return;
    }

    setStatus("done");
    const dates = new Set(rows.map((r) => r.work_date));
    setSummary(`${dates.size}일 · ${rows.length}건 반영 완료`);
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <h2 className="font-semibold text-sm">엑셀 업로드</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-lg leading-none"
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
                A열: 날짜, B~H열: A~G 직원의 근무코드(메/조/야/여/주/휴/대)로 된 .xlsx 양식을
                올려주세요. 업로드하면 해당 날짜들의 근무표가 그대로 덮어써져요.
              </p>

              <input
                type="file"
                accept=".xlsx"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                disabled={status === "parsing" || status === "saving"}
                className="text-sm text-gray-500 disabled:opacity-50 file:mr-3 file:px-3 file:py-1.5 file:rounded file:border file:border-gray-300 file:bg-white file:text-sm file:font-medium file:text-gray-700 file:cursor-pointer hover:file:bg-gray-50"
              />
            </>
          )}

          {status === "parsing" && <p className="text-gray-400">읽는 중...</p>}
          {status === "saving" && <p className="text-gray-400">저장 중...</p>}
          {status === "done" && summary && <p className="text-green-600">{summary}</p>}
          {status === "error" && errorMsg && <p className="text-red-600">{errorMsg}</p>}

          {warnings.length > 0 && (
            <div className="border border-amber-300 bg-amber-50 rounded p-2 max-h-40 overflow-y-auto">
              <p className="text-xs font-medium text-amber-800 mb-1">
                건너뛴 항목 {warnings.length}건
              </p>
              <ul className="text-xs text-amber-700 space-y-0.5">
                {warnings.slice(0, 30).map((w, i) => (
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
