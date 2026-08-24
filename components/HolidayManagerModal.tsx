"use client";

import { useState } from "react";
import Image from "next/image";
import { useHolidayManager } from "@/lib/useHolidayManager";
import { weekdayLabel } from "@/lib/dateUtils";
import { parseHolidayFile, applyParsedHolidays, ParseHolidayResult } from "@/lib/holidayImport";
import { useToast } from "@/app/providers";
import Button from "./ui/Button";
import LinkButton from "./ui/LinkButton";

interface Props {
  open: boolean;
  onClose: () => void;
  calendarYear: number;
}

type BulkStatus = "idle" | "parsing" | "parsed" | "saving" | "done" | "error";

function formatDate(dateStr: string): string {
  return `${Number(dateStr.slice(5, 7))}/${Number(dateStr.slice(8, 10))}(${weekdayLabel(dateStr)})`;
}

export default function HolidayManagerModal({ open, onClose, calendarYear }: Props) {
  const [year, setYear] = useState(calendarYear);
  const { holidays, loading, addHoliday, renameHoliday, deleteHoliday } = useHolidayManager(year);
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newName, setNewName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  const [mode, setMode] = useState<"list" | "bulk">("list");
  const [bulkStatus, setBulkStatus] = useState<BulkStatus>("idle");
  const [bulkParsed, setBulkParsed] = useState<ParseHolidayResult | null>(null);
  const [bulkSummary, setBulkSummary] = useState<string | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkInputKey, setBulkInputKey] = useState(0);
  const { showToast } = useToast();

  if (!open) return null;

  const startEdit = (workDate: string, name: string | null) => {
    setEditingDate(workDate);
    setEditingName(name ?? "");
  };

  const commitEdit = async () => {
    if (editingDate) {
      await renameHoliday(editingDate, editingName.trim() || null);
      showToast("변경 완료!");
    }
    setEditingDate(null);
    setEditingName("");
  };

  const handleDelete = async (workDate: string, name: string | null) => {
    const ok = window.confirm(
      `${formatDate(workDate)}${name ? ` (${name})` : ""} 공휴일 지정을 해제할까요?\n이미 자동으로 휴무 처리된 근무는 되돌아가지 않아요.`
    );
    if (!ok) return;
    await deleteHoliday(workDate);
    showToast("삭제 완료!");
  };

  const handleAdd = async () => {
    if (!newDate) {
      setAddError("날짜를 선택해주세요.");
      return;
    }
    const { error } = await addHoliday(newDate, newName.trim() || null);
    if (error) {
      setAddError(error);
      return;
    }
    setNewDate("");
    setNewName("");
    setAddError(null);
    showToast("저장 완료!");
  };

  const resetBulk = () => {
    setBulkStatus("idle");
    setBulkParsed(null);
    setBulkSummary(null);
    setBulkError(null);
    setBulkInputKey((k) => k + 1);
  };

  const switchToBulk = () => {
    resetBulk();
    setMode("bulk");
  };

  const switchToList = () => {
    resetBulk();
    setMode("list");
  };

  const handleBulkFile = async (file: File) => {
    setBulkStatus("parsing");
    setBulkSummary(null);
    setBulkError(null);

    const result = await parseHolidayFile(file);
    setBulkParsed(result);

    if (result.rows.length === 0) {
      setBulkStatus("error");
      setBulkError("반영할 데이터가 없어요. 양식을 확인해주세요.");
      return;
    }
    setBulkStatus("parsed");
  };

  const handleBulkApply = async () => {
    if (!bulkParsed) return;
    setBulkStatus("saving");

    const { error } = await applyParsedHolidays(bulkParsed.rows);
    if (error) {
      setBulkStatus("error");
      setBulkError(`저장 실패: ${error}`);
      return;
    }

    setBulkSummary(`${bulkParsed.rows.length}건 반영 완료`);
    setBulkStatus("done");
    setBulkParsed(null);
    showToast("저장 완료!");
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[3px] animate-[fadeIn_150ms_ease-out]" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col animate-[popIn_150ms_ease-out]">
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <h2 className="font-semibold text-sm">공휴일 관리</h2>
          <div className="flex items-center gap-2">
            {mode === "bulk" && (
              <LinkButton
                href="/templates/holiday-template.xlsx"
                download="GMS스케줄앱_양식_법정공휴일.xlsx"
                onClick={() => showToast("다운로드 완료!")}
                className="text-xs px-2 py-1"
              >
                양식 다운로드
              </LinkButton>
            )}
            <button
              type="button"
              onClick={onClose}
              className="text-black text-lg leading-none rounded-md p-1 transition-all duration-150 hover:bg-gray-100 hover:scale-110"
            >
              ✕
            </button>
          </div>
        </div>

        {mode === "list" ? (
          <>
            <div className="flex items-center justify-between gap-2 px-4 py-2 border-b shrink-0">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setYear((y) => y - 1)}
                  className="w-7 h-7 text-sm border rounded-md transition-all duration-150 hover:bg-gray-100 hover:shadow-sm"
                >
                  ◀
                </button>
                <span className="font-semibold text-sm text-black w-16 text-center">{year}년</span>
                <button
                  type="button"
                  onClick={() => setYear((y) => y + 1)}
                  className="w-7 h-7 text-sm border rounded-md transition-all duration-150 hover:bg-gray-100 hover:shadow-sm"
                >
                  ▶
                </button>
              </div>
              <Button onClick={switchToBulk} className="text-xs px-2 py-1">
                엑셀 일괄 등록
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {loading ? (
                <p className="text-sm text-black">불러오는 중...</p>
              ) : holidays.length === 0 ? (
                <p className="text-sm text-black">{year}년에 등록된 공휴일이 없어요.</p>
              ) : (
                holidays.map((h) => (
                  <div
                    key={h.work_date}
                    className="flex items-center gap-2 border rounded-lg px-2 py-2 transition-all duration-150 hover:shadow-sm"
                  >
                    <span className="w-20 text-xs font-semibold text-black shrink-0">
                      {formatDate(h.work_date)}
                    </span>

                    {editingDate === h.work_date ? (
                      <input
                        autoFocus
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && commitEdit()}
                        onBlur={commitEdit}
                        placeholder="공휴일 이름"
                        className="flex-1 min-w-0 border rounded-md px-2 py-1 text-sm transition-shadow duration-150 focus:outline-none focus:ring-1 focus:ring-gray-300"
                      />
                    ) : (
                      <span
                        className="flex-1 min-w-0 text-sm cursor-pointer rounded-md px-1 -mx-1 truncate transition-colors duration-150 hover:bg-gray-100"
                        onClick={() => startEdit(h.work_date, h.name)}
                        title="클릭해서 이름 수정"
                      >
                        {h.name || <span className="text-black">(이름 없음)</span>}
                      </span>
                    )}

                    <Button
                      variant="danger"
                      onClick={() => handleDelete(h.work_date, h.name)}
                      className="text-xs px-2 py-1 shrink-0"
                    >
                      삭제
                    </Button>
                  </div>
                ))
              )}
            </div>

            <div className="border-t p-3 space-y-2 shrink-0">
              <p className="text-xs text-black">
                추가하면 그 날짜에 주간/대휴로 잡힌 근무는 자동으로 휴무로 바뀌어요.
              </p>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={newDate}
                  min={`${year}-01-01`}
                  max={`${year}-12-31`}
                  onChange={(e) => {
                    setNewDate(e.target.value);
                    setAddError(null);
                  }}
                  className="border rounded-lg px-2 py-1.5 text-sm transition-shadow duration-150 focus:outline-none focus:ring-1 focus:ring-gray-300"
                />
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                  placeholder="이름 (선택)"
                  className="flex-1 min-w-0 border rounded-lg px-2 py-1.5 text-sm transition-shadow duration-150 focus:outline-none focus:ring-1 focus:ring-gray-300"
                />
                <Button variant="primary" onClick={handleAdd} className="px-3 py-1.5 shrink-0">
                  추가
                </Button>
              </div>
              {addError && <p className="text-red-600 text-xs">{addError}</p>}
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
            <button
              type="button"
              onClick={switchToList}
              className="text-xs text-blue-900 font-medium hover:underline"
            >
              ◀ 목록으로
            </button>

            <p className="text-xs text-black">
              A열: 날짜, B열: 공휴일 이름을 적은 .xlsx 파일을 올려주세요. 1행은 제목행으로 보고
              2행부터 읽어요. 이름은 비워도 되고, 이미 등록된 날짜는 새 이름으로 덮어써요. 그
              날짜에 이미 주간/대휴로 잡힌 근무가 있으면 자동으로 휴무로 바뀌어요.
            </p>
            <Image
              src="/holiday-excel-example.png"
              alt="공휴일 엑셀 양식 예시 (A열: 날짜, B열: 이름)"
              width={397}
              height={500}
              className="w-full max-w-[220px] h-auto rounded-lg border"
            />

            {(bulkStatus === "idle" || bulkStatus === "parsing" || bulkStatus === "error") && (
              <input
                key={bulkInputKey}
                type="file"
                accept=".xlsx"
                onChange={(e) => e.target.files?.[0] && handleBulkFile(e.target.files[0])}
                disabled={bulkStatus === "parsing"}
                className="text-sm text-black disabled:opacity-50 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border file:border-gray-300 file:bg-white file:text-sm file:font-medium file:text-black file:cursor-pointer file:transition-all file:duration-150 hover:file:bg-gray-100 hover:file:border-gray-400"
              />
            )}

            {bulkStatus === "parsing" && <p className="text-black">읽는 중...</p>}
            {bulkStatus === "saving" && <p className="text-black">저장 중...</p>}
            {bulkStatus === "done" && bulkSummary && <p className="text-green-600">{bulkSummary}</p>}
            {bulkStatus === "error" && bulkError && <p className="text-red-600">{bulkError}</p>}

            {bulkStatus === "done" && (
              <Button onClick={resetBulk} className="text-xs px-2 py-1">
                다른 파일 업로드
              </Button>
            )}

            {bulkParsed && (bulkStatus === "parsed" || bulkStatus === "saving") && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-black">
                  미리보기 — {bulkParsed.rows.length}건
                </p>
                <div className="border rounded-lg overflow-auto max-h-64">
                  <table className="text-xs w-full">
                    <thead className="sticky top-0 bg-gray-50">
                      <tr>
                        <th className="px-2 py-1 text-left border-b whitespace-nowrap">날짜</th>
                        <th className="px-2 py-1 text-left border-b">이름</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkParsed.rows.map((row) => (
                        <tr
                          key={row.work_date}
                          className="border-b last:border-b-0 transition-colors duration-150 hover:bg-gray-100"
                        >
                          <td className="px-2 py-1 whitespace-nowrap">{formatDate(row.work_date)}</td>
                          <td className="px-2 py-1">{row.name ?? ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    onClick={handleBulkApply}
                    disabled={bulkStatus === "saving"}
                    className="flex-1 py-2"
                  >
                    {bulkStatus === "saving" ? "저장 중..." : "적용"}
                  </Button>
                  <Button onClick={resetBulk} disabled={bulkStatus === "saving"} className="py-2">
                    취소
                  </Button>
                </div>
              </div>
            )}

            {bulkParsed && bulkParsed.warnings.length > 0 && (
              <div className="border border-amber-300 bg-amber-50 rounded-lg p-2 max-h-40 overflow-y-auto">
                <p className="text-xs font-medium text-amber-800 mb-1">
                  건너뛴 항목 {bulkParsed.warnings.length}건
                </p>
                <ul className="text-xs text-amber-700 space-y-0.5">
                  {bulkParsed.warnings.slice(0, 30).map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
