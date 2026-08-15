"use client";

import { useState } from "react";
import { useAuth } from "@/app/providers";
import {
  parseBackupFile,
  fetchCurrentCounts,
  restoreFromBackup,
  tableConfigList,
  FullBackupPayload,
} from "@/lib/fullBackupRestore";
import Button from "./ui/Button";
import ConfirmPhraseDialog from "./ConfirmPhraseDialog";

interface Props {
  open: boolean;
  onClose: () => void;
}

type Status = "idle" | "parsing" | "previewing" | "restoring" | "done" | "error";

export default function FullRestoreModal({ open, onClose }: Props) {
  const { session } = useAuth();
  const canEdit = !!session;
  const [status, setStatus] = useState<Status>("idle");
  const [backup, setBackup] = useState<FullBackupPayload | null>(null);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);

  if (!open) return null;

  const isBusy = status === "restoring";

  const handleClose = () => {
    if (isBusy) return; // 복원 진행 중에는 닫지 못하게 막는다
    onClose();
  };

  const reset = () => {
    setStatus("idle");
    setBackup(null);
    setCounts(null);
    setConfirmOpen(false);
    setProgress(null);
    setErrorMsg(null);
    setInputKey((k) => k + 1);
  };

  const handleFile = async (file: File) => {
    if (!canEdit) return;
    setStatus("parsing");
    setErrorMsg(null);

    const text = await file.text();
    const result = parseBackupFile(text);
    if (result.error || !result.data) {
      setStatus("error");
      setErrorMsg(result.error ?? "백업 파일을 읽지 못했어요.");
      return;
    }

    const currentCounts = await fetchCurrentCounts();
    setBackup(result.data);
    setCounts(currentCounts);
    setStatus("previewing");
  };

  const handleRestore = async () => {
    if (!backup) return;
    setConfirmOpen(false);
    setStatus("restoring");
    setErrorMsg(null);

    const { error } = await restoreFromBackup(backup, (message) => setProgress(message));
    if (error) {
      setStatus("error");
      setErrorMsg(error);
      return;
    }

    setStatus("done");
    setTimeout(() => window.location.reload(), 1500);
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/30 animate-[fadeIn_150ms_ease-out]"
        onClick={handleClose}
      />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col animate-[popIn_150ms_ease-out]">
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <h2 className="font-semibold text-sm">전체 복원</h2>
          <button
            type="button"
            onClick={handleClose}
            disabled={isBusy}
            className="text-black text-lg leading-none rounded-md p-1 transition-all duration-150 hover:bg-gray-100 hover:scale-110 disabled:opacity-30 disabled:pointer-events-none"
          >
            ✕
          </button>
        </div>

        {isBusy ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-sm">
            <div className="h-10 w-10 rounded-full border-4 border-gray-200 border-t-blue-900 animate-spin" />
            <p className="text-black font-medium">{progress ?? "복원 중..."}</p>
            <p className="text-xs text-black text-center">
              데이터를 지우고 다시 채우는 중이에요. 창을 닫거나 새로고침하지 마세요.
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
            {!canEdit ? (
              <p className="text-red-500">로그인한 사용자만 복원할 수 있어요.</p>
            ) : (
              <>
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5">
                  ⚠️ &quot;전체 백업(JSON)&quot;으로 받은 파일을 그대로 다시 올려서 지금 DB
                  내용을 그 시점 상태로 되돌리는 기능이에요. 적용하는 순간 현재 모든
                  데이터(직원/근무표/공휴일/수기입력 값 등)가 지워지고 백업 시점 데이터로 완전히
                  대체돼요. 되돌릴 수 없으니 신중하게 사용해주세요.
                </p>

                {(status === "idle" || status === "parsing" || status === "error") && (
                  <input
                    key={inputKey}
                    type="file"
                    accept=".json"
                    onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                    disabled={status === "parsing"}
                    className="text-sm text-black disabled:opacity-50 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border file:border-gray-300 file:bg-white file:text-sm file:font-medium file:text-black file:cursor-pointer file:transition-all file:duration-150 hover:file:bg-gray-100 hover:file:border-gray-400"
                  />
                )}
              </>
            )}

            {status === "parsing" && <p className="text-black">읽는 중...</p>}
            {status === "done" && (
              <p className="text-green-600">복원 완료! 잠시 후 페이지를 새로고침할게요.</p>
            )}
            {status === "error" && errorMsg && (
              <p className="text-red-600">
                {errorMsg}
                {progress && " (앞선 일부 테이블은 이미 반영됐을 수 있어요)"}
              </p>
            )}

            {status === "error" && (
              <Button onClick={reset} className="text-xs px-2 py-1">
                다시 시도
              </Button>
            )}

            {backup && counts && status === "previewing" && (
              <div className="space-y-3">
                <div className="border rounded-lg overflow-auto max-h-64">
                  <table className="text-xs w-full">
                    <thead className="sticky top-0 bg-gray-50">
                      <tr>
                        <th className="px-2 py-1 text-left border-b whitespace-nowrap">테이블</th>
                        <th className="px-2 py-1 text-right border-b whitespace-nowrap">현재</th>
                        <th className="px-2 py-1 text-right border-b whitespace-nowrap">백업</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableConfigList().map((c) => (
                        <tr key={c.table} className="border-b last:border-b-0">
                          <td className="px-2 py-1 whitespace-nowrap">{c.label}</td>
                          <td className="px-2 py-1 text-right">{counts[c.table] ?? 0}건</td>
                          <td className="px-2 py-1 text-right">
                            {(backup.tables[c.table]?.length as number) ?? 0}건
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {backup.exportedAt && (
                  <p className="text-xs text-black">
                    백업 생성 시각: {new Date(backup.exportedAt).toLocaleString("ko-KR")}
                  </p>
                )}

                <div className="flex gap-2">
                  <Button
                    variant="danger"
                    onClick={() => setConfirmOpen(true)}
                    className="flex-1 py-2"
                  >
                    복원 실행
                  </Button>
                  <Button onClick={reset} className="py-2">
                    취소
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <ConfirmPhraseDialog
        open={confirmOpen}
        title="전체 복원"
        message="지금 모든 데이터가 지워지고 백업 시점 데이터로 완전히 대체돼요. 되돌릴 수 없으니 신중하게 진행하세요."
        phrase="전체복원"
        danger
        onConfirm={handleRestore}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
