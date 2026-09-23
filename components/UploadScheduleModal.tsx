"use client";

import { useState } from "react";
import Image from "next/image";
import { useAuth, useGlobalLoading, useToast } from "@/app/providers";
import { useEmployees } from "@/lib/useEmployees";
import {
  parseScheduleFile,
  applyParsedSchedule,
  ParseResult,
} from "@/lib/scheduleImport";
import { parseLegacyScheduleFile } from "@/lib/legacyScheduleImport";
import { weekdayLabel } from "@/lib/dateUtils";
import { employeeLabel, RAW_CODE_BG_CLASS } from "@/lib/types";
import Button from "./ui/Button";
import LinkButton from "./ui/LinkButton";

interface Props {
  open: boolean;
  onClose: () => void;
}

type Status = "idle" | "parsing" | "parsed" | "saving" | "done" | "error";
type Mode = "standard" | "legacy";

function formatDate(dateStr: string): string {
  return `${Number(dateStr.slice(5, 7))}/${Number(dateStr.slice(8, 10))}(${weekdayLabel(dateStr)})`;
}

export default function UploadScheduleModal({ open, onClose }: Props) {
  const { canEdit } = useAuth();
  const { employees } = useEmployees();
  const { runWithLoading } = useGlobalLoading();
  const { showToast } = useToast();
  const [mode, setMode] = useState<Mode>("standard");
  const [status, setStatus] = useState<Status>("idle");
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);
  // 이전 근무표 변환 모드에서만 쓰는 상태: 매칭 안 된 범례 이름들, 그리고 사용자가
  // 그 이름들을 직접 지정한 직원(이름→employee id). 파일은 다시 매칭할 때 재사용하려고
  // 들고 있는다(사용자가 다시 파일을 고를 필요 없게).
  const [file, setFile] = useState<File | null>(null);
  const [unmatchedNames, setUnmatchedNames] = useState<string[]>([]);
  const [nameOverrides, setNameOverrides] = useState<Record<string, string>>({});
  // 반영 대상으로 남긴 월('yyyy-MM'). 파일에 여러 달이 섞여 있어도 이 근무표는 월 단위로만
  // 올리는 거라, 건수가 가장 많은 달 하나만 남기고 나머지는 제외한다.
  const [keptMonth, setKeptMonth] = useState<string | null>(null);

  if (!open) return null;

  const reset = () => {
    setStatus("idle");
    setParsed(null);
    setSummary(null);
    setErrorMsg(null);
    setFile(null);
    setUnmatchedNames([]);
    setNameOverrides({});
    setKeptMonth(null);
    setInputKey((k) => k + 1); // 같은 파일 다시 선택 가능하도록 input 리마운트
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    reset();
  };

  const runParse = async (f: File, overrides: Record<string, string>) => {
    setStatus("parsing");
    setSummary(null);
    setErrorMsg(null);

    if (mode === "standard") {
      const result = await parseScheduleFile(f, employees);
      setParsed(result);
      setUnmatchedNames([]);
      setKeptMonth(null);
      if (result.rows.length === 0 && result.clearedCells.length === 0) {
        setStatus("error");
        setErrorMsg("반영할 데이터가 없어요. 양식을 확인해주세요.");
        return;
      }
      setStatus("parsed");
      return;
    }

    const result = await parseLegacyScheduleFile(f, employees, overrides);
    setParsed(result);
    setUnmatchedNames(result.unmatchedLegendNames);
    setKeptMonth(result.keptMonth);
    if (result.rows.length === 0 && result.clearedCells.length === 0) {
      setStatus("error");
      setErrorMsg("반영할 데이터가 없어요. 양식을 확인해주세요.");
      return;
    }
    setStatus("parsed");
  };

  const handleFile = async (f: File) => {
    if (!canEdit) return;
    setFile(f);
    setNameOverrides({});
    await runParse(f, {});
  };

  const handleRematch = async () => {
    if (!file) return;
    await runParse(file, nameOverrides);
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
      const linkedLeaveCount = parsed.rows.filter((r) => r.leave_for_date).length;
      const leaveNote = linkedLeaveCount > 0 ? ` · 대휴 연결 ${linkedLeaveCount}건` : "";
      setSummary(`${dates.size}일 · ${parsed.rows.length}건 반영 완료${leaveNote}${clearedNote}`);
      setStatus("done");
      setParsed(null);
      showToast("저장 완료!");
    });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[3px] animate-[fadeIn_150ms_ease-out]" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col animate-[popIn_150ms_ease-out]">
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <h2 className="font-semibold text-base">근무표 업로드</h2>
          <div className="flex items-center gap-2">
            {canEdit && mode === "standard" && (
              <LinkButton
                href="/templates/schedule-upload-template.xlsx"
                download="GMS스케줄앱_양식_근무표업로드.xlsx"
                onClick={() => showToast("다운로드 완료!")}
                className="text-sm px-2.5 py-1"
              >
                양식 다운로드
              </LinkButton>
            )}
            {canEdit && mode === "legacy" && (
              <LinkButton
                href="/templates/legacy-schedule-example.xlsx"
                download="GMS스케줄앱_양식_이전근무표변환.xlsx"
                onClick={() => showToast("다운로드 완료!")}
                className="text-sm px-2.5 py-1"
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

        <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
          {!canEdit ? (
            <p className="text-red-500">로그인한 사용자만 업로드할 수 있어요.</p>
          ) : (
            <>
              <div className="flex gap-1.5">
                <Button
                  active={mode === "standard"}
                  onClick={() => switchMode("standard")}
                  className="text-sm px-2.5 py-1"
                >
                  표준 양식
                </Button>
                <Button
                  active={mode === "legacy"}
                  onClick={() => switchMode("legacy")}
                  className="text-sm px-2.5 py-1"
                >
                  이전 근무표 변환
                </Button>
              </div>

              {mode === "standard" ? (
                <>
                  <div className="text-sm text-black leading-relaxed">
                    <p>· A열: 날짜, B열~: 1행 근무자 글자(A,B,C...), 그 아래 근무코드(메/조/야/여/주/휴/대)</p>
                    <p>· 열 순서 무관, 인원수 제한 없음 (1행 글자로 매칭)</p>
                    <p>· 날짜·직원 매칭 확인 후 &quot;적용&quot; 클릭 시 반영</p>
                    <p>· 빈 칸 = 해당 근무자·날짜 기존 기록 삭제</p>
                  </div>
                  <Image
                    src="/schedule-upload-example.png"
                    alt="근무표 업로드 엑셀 양식 예시 (A열: 날짜, B열부터 근무자별 근무코드)"
                    width={406}
                    height={297}
                    className="w-full max-w-sm h-auto rounded-lg border"
                  />
                </>
              ) : (
                <div className="text-sm text-black leading-relaxed">
                  <p className="font-semibold text-blue-900">
                    · 위 &quot;양식 다운로드&quot;로 받은 파일에 기존 GMS근무표를 그대로 붙여넣고 업로드하면 적용 가능
                  </p>
                  <p>· 예전 엑셀 근무표(요일 블록 + 06:30~24:00 슬롯 표시) 그대로 업로드</p>
                  <p>· 새벽/주간/야간: 슬롯 표시로 인식</p>
                  <p>· 대휴: &quot;적용 일자&quot; 칸 M/D → 원래근무일로 자동 연결</p>
                  <p>· 연차·건강검진 등 기타 텍스트 → 주간근무로 반영</p>
                  <p>· 인원수·이름·날짜 범위: 파일 내용에서 자동 인식</p>
                  <p>· 월 단위 업로드 — 여러 달 섞이면 최다 건수 달만 반영</p>
                  <p>· 미리보기 확인 후 &quot;적용&quot; 클릭</p>
                </div>
              )}

              {(status === "idle" || status === "parsing" || status === "error") && (
                <input
                  key={inputKey}
                  type="file"
                  accept=".xlsx"
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                  disabled={status === "parsing"}
                  className="text-sm text-black disabled:opacity-50 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border file:border-gray-300 file:bg-white file:text-sm file:font-medium file:text-black file:cursor-pointer file:transition-all file:duration-150 hover:file:bg-gray-100 hover:file:border-gray-400"
                />
              )}
            </>
          )}

          {status === "parsing" && <p className="text-black">읽는 중...</p>}
          {status === "saving" && <p className="text-black">저장 중...</p>}
          {status === "done" && summary && <p className="text-green-600">{summary}</p>}
          {status === "error" && errorMsg && <p className="text-red-600">{errorMsg}</p>}

          {status === "done" && (
            <Button onClick={reset} className="text-sm px-2.5 py-1">
              다른 파일 업로드
            </Button>
          )}

          {mode === "legacy" &&
            unmatchedNames.length > 0 &&
            (status === "parsed" || status === "saving") && (
              <div className="border border-amber-300 bg-amber-50 rounded-lg p-2 space-y-2">
                <p className="text-sm font-medium text-amber-800">
                  매칭 안 된 이름 {unmatchedNames.length}건 — 지금 직원 중 누구인지 골라주면
                  그 사람 근무로 반영돼요
                </p>
                <div className="space-y-1.5">
                  {unmatchedNames.map((name) => (
                    <div key={name} className="flex items-center gap-2 text-sm">
                      <span className="w-20 shrink-0 truncate font-medium">{name}</span>
                      <span className="text-black">→</span>
                      <select
                        value={nameOverrides[name] ?? ""}
                        onChange={(e) =>
                          setNameOverrides((prev) => ({ ...prev, [name]: e.target.value }))
                        }
                        className="flex-1 border rounded-lg px-2 py-1 text-sm bg-white"
                      >
                        <option value="">건너뛰기</option>
                        {employees.map((emp) => (
                          <option key={emp.id} value={emp.id}>
                            {emp.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
                <Button
                  onClick={handleRematch}
                  disabled={status === "saving"}
                  className="text-sm px-2.5 py-1"
                >
                  다시 매칭
                </Button>
              </div>
            )}

          {parsed && (status === "parsed" || status === "saving") && (
            <div className="space-y-2">
              {mode === "legacy" && keptMonth && (
                <p className="text-sm font-medium text-blue-900">
                  반영 대상 월: {keptMonth} (다른 달 기록은 자동으로 제외돼요)
                </p>
              )}
              <p className="text-sm font-medium text-black">
                미리보기 — 날짜와 직원 매칭을 확인해주세요
              </p>
              <div className="border rounded-lg overflow-auto max-h-64">
                <table className="text-sm w-full">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr>
                      <th className="px-2 py-1 text-left border-b whitespace-nowrap">날짜</th>
                      {parsed.employeeNames.map((name, i) => (
                        <th key={i} className="px-2 py-1 text-left border-b whitespace-nowrap">
                          {employeeLabel(i)}
                          <br />
                          <span className="text-black font-normal">{name ?? "(없음)"}</span>
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
                          <td
                            key={i}
                            className={`px-2 py-1 text-center ${
                              code ? RAW_CODE_BG_CLASS[code] ?? "" : ""
                            }`}
                          >
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
              <p className="text-sm font-medium text-amber-800 mb-1">
                건너뛴 항목 {parsed.warnings.length}건
              </p>
              <ul className="text-sm text-amber-700 space-y-0.5">
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
