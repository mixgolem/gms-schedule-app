"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { addDays, differenceInCalendarDays, format } from "date-fns";
import { useAuth, useGlobalLoading, useToast } from "@/app/providers";
import { useEmployees } from "@/lib/useEmployees";
import { useShiftDefaults } from "@/lib/useShiftDefaults";
import { useShiftPattern } from "@/lib/useShiftPattern";
import {
  parsePatternFile,
  validatePattern,
  downloadPatternExcel,
  PatternDays,
} from "@/lib/shiftPatternImport";
import { generatePatternRows, applyPatternRows } from "@/lib/shiftPatternApply";
import { generateShiftPattern, verifyGeneratedPattern, MIN_EMPLOYEES } from "@/lib/generateShiftPattern";
import { employeeLabel, RAW_CODE_BG_CLASS } from "@/lib/types";
import { todayStr, parseLocalDate, weekdayLabel } from "@/lib/dateUtils";
import { computeCycleStatus, startDateAlignment, CycleStatus } from "@/lib/patternCycle";
import { useDetectedCycle } from "@/lib/useDetectedCycle";
import Button from "./ui/Button";
import ConfirmDialog from "./ConfirmDialog";
import ConfirmPhraseDialog from "./ConfirmPhraseDialog";
import ReadOnlyNotice from "./ui/ReadOnlyNotice";

interface Props {
  open: boolean;
  onClose: () => void;
}

type Status = "idle" | "parsing" | "parsed" | "saving" | "applying" | "done" | "error";
type Mode = "upload" | "generate";

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

const DEFAULT_CYCLES = 1; // 패턴 길이 × 1회

const CODE_ORDER = ["메", "조", "야", "여", "주", "휴", "대"] as const;

// 패턴 1일차는 항상 월요일로 취급한다(자동 생성의 주말/평일 규칙과 동일한 기준).
const PATTERN_WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

// 저장 전 미리보기(방금 올리거나 생성한 패턴)와, 저장된 패턴을 적용할 때의 표를 똑같은
// 모양으로 보여주기 위한 공용 표 — 실제 근무표와 같은 색으로 칠한다(RAW_CODE_BG_CLASS).
function PatternPreviewTable({
  days,
  presentSlots,
}: {
  days: PatternDays;
  presentSlots: boolean[];
}) {
  return (
    <div className="border rounded-lg overflow-auto max-h-56">
      <table className="text-sm w-full">
        <thead className="sticky top-0 bg-gray-50">
          <tr>
            <th className="px-2 py-1 text-left border-b whitespace-nowrap">일차</th>
            {Array.from({ length: days[0]?.length ?? 0 }, (_, i) => (
              <th
                key={i}
                className={`px-2 py-1 text-left border-b whitespace-nowrap ${
                  presentSlots[i] ? "" : "text-black"
                }`}
                title={presentSlots[i] ? undefined : "이 패턴에 없는 자리"}
              >
                {employeeLabel(i)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((row, i) => (
            <tr key={i} className="border-b last:border-b-0">
              <td className="px-2 py-1 whitespace-nowrap text-black">
                {i + 1}({PATTERN_WEEKDAY_LABELS[i % 7]})
              </td>
              {row.map((cell, ci) => {
                const code = cell ? PREVIEW_CODE[`${cell.shiftType}:${cell.isMain}`] : undefined;
                return (
                  <td
                    key={ci}
                    className={`px-2 py-1 text-center ${code ? RAW_CODE_BG_CLASS[code] ?? "" : ""}`}
                  >
                    {cell ? code ?? "?" : ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// 근무자(열)별로 메/조/야/여/주/휴/대가 각각 며칠씩인지 세서 보여주는 표 — 자동 생성이
// 실제로 공평하게 나왔는지, 업로드한 패턴이 한쪽으로 쏠리진 않았는지 한눈에 확인용.
function PatternCategoryCounts({
  days,
  presentSlots,
}: {
  days: PatternDays;
  presentSlots: boolean[];
}) {
  const slotCount = days[0]?.length ?? 0;
  const counts = Array.from({ length: slotCount }, () => {
    const c: Record<string, number> = {};
    for (const code of CODE_ORDER) c[code] = 0;
    return c;
  });
  for (const row of days) {
    for (let slot = 0; slot < slotCount; slot++) {
      if (!presentSlots[slot]) continue;
      const cell = row[slot];
      const code = cell ? PREVIEW_CODE[`${cell.shiftType}:${cell.isMain}`] : null;
      if (code) counts[slot][code] += 1;
    }
  }

  return (
    <div className="border rounded-lg overflow-auto max-h-48">
      <table className="text-sm w-full">
        <thead className="sticky top-0 bg-gray-50">
          <tr>
            <th className="px-2 py-1 text-left border-b whitespace-nowrap">근무자</th>
            {CODE_ORDER.map((code) => (
              <th key={code} className="px-2 py-1 text-center border-b whitespace-nowrap">
                {code}
              </th>
            ))}
            <th className="px-2 py-1 text-center border-b whitespace-nowrap">합계</th>
          </tr>
        </thead>
        <tbody>
          {counts.map((c, slot) => {
            if (!presentSlots[slot]) return null;
            const total = CODE_ORDER.reduce((sum, code) => sum + c[code], 0);
            return (
              <tr key={slot} className="border-b last:border-b-0">
                <td className="px-2 py-1 whitespace-nowrap text-black font-medium">
                  {employeeLabel(slot)}
                </td>
                {CODE_ORDER.map((code) => (
                  <td
                    key={code}
                    className={`px-2 py-1 text-center ${RAW_CODE_BG_CLASS[code] ?? ""}`}
                  >
                    {c[code]}
                  </td>
                ))}
                <td className="px-2 py-1 text-center text-black">{total}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function formatMonthDay(date: string): string {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}(${weekdayLabel(date)})`;
}

// 지금 적용돼 있는 패턴이 몇 주기 며칠차인지, 언제 끝나고 다음 주기가 언제 시작하는지 막대로 보여준다.
function CycleProgressCard({ cycle, matchRate }: { cycle: CycleStatus; matchRate: number }) {
  if (!cycle.started) {
    return (
      <div className="rounded-lg border-2 border-blue-900 bg-blue-50 px-3 py-2 text-sm text-blue-950">
        <p className="font-bold">적용 예정인 패턴이 있어요</p>
        <p className="mt-0.5">{formatMonthDay(cycle.nextCycleStart)}부터 시작해요.</p>
      </div>
    );
  }
  const percent = Math.round((cycle.dayInCycle / cycle.cycleLength) * 100);
  return (
    <div className="rounded-lg border-2 border-blue-900 bg-blue-50 px-3 py-2.5 text-sm text-blue-950 space-y-2">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <p className="font-bold">현재 패턴 진행 중 · {cycle.cycleNumber}주기</p>
        <p className="font-extrabold text-base">
          {cycle.dayInCycle} / {cycle.cycleLength}일차
        </p>
      </div>
      <div className="h-2.5 rounded-full bg-white border border-blue-200 overflow-hidden">
        <div className="h-full rounded-full bg-blue-900" style={{ width: `${percent}%` }} />
      </div>
      <p>
        {formatMonthDay(cycle.cycleStart)} 시작 · {formatMonthDay(cycle.cycleEnd)} 종료
        {cycle.daysLeft > 0 ? ` (${cycle.daysLeft}일 남음)` : " (오늘 마지막 날)"} →{" "}
        <b>다음 주기 시작 {formatMonthDay(cycle.nextCycleStart)}</b>
      </p>
      <p className="text-xs text-blue-900/70">
        실제 근무표로 판단했어요 — 최근 근무가 저장된 패턴과 {Math.round(matchRate * 100)}% 일치(나머지는
        대휴·연차 등 개별 수정)
      </p>
    </div>
  );
}

export default function ShiftPatternModal({ open, onClose }: Props) {
  const { canEdit } = useAuth();
  const { employees } = useEmployees();
  const { defaults: shiftDefaults } = useShiftDefaults();
  const { current, latestApplication, uploadPattern, recordApplication } = useShiftPattern();
  const { runWithLoading } = useGlobalLoading();
  const { showToast } = useToast();

  const [mode, setMode] = useState<Mode>("upload");
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
  const [genEmployeeCount, setGenEmployeeCount] = useState(() =>
    Math.max(MIN_EMPLOYEES, employees.filter((e) => e.active).length || MIN_EMPLOYEES)
  );
  const [genCycleMultiplier, setGenCycleMultiplier] = useState(1);
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);
  // 시작일을 직접 고쳤는지 — 안 고쳤으면 "다음 주기 시작일"을 기본값으로 계속 맞춰 둔다
  const [startTouched, setStartTouched] = useState(false);
  const [applyConfirm, setApplyConfirm] = useState<"normal" | "midCycle" | null>(null);

  // 지금 돌아가는 패턴의 주기(몇 주기 며칠차, 언제 끝나는지). 적용 기록은 실제와 어긋날 수 있어서
  // 실제 근무표로 알아낸다. 근무표가 어느 패턴과도 잘 안 맞으면 null → 예전처럼 안내 문구만.
  const { detected } = useDetectedCycle(open, latestApplication?.appliedAt);
  const cycle: CycleStatus | null = detected
    ? computeCycleStatus(detected.anchorStart, detected.cycleLength, todayStr())
    : null;
  const nextCycleStart = cycle?.nextCycleStart ?? null;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) setStartTouched(false);
  }, [open]);

  useEffect(() => {
    // 기본 시작일은 "오늘"이 아니라 진행 중인 주기가 끝난 다음 날 — 주기 중간에 덮어쓰는 실수 방지
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open && !startTouched && nextCycleStart) setStartDate(nextCycleStart);
  }, [open, startTouched, nextCycleStart]);

  if (!open) return null;

  const alignment = detected
    ? startDateAlignment(detected.anchorStart, detected.cycleLength, startDate)
    : null;

  const chooseStartDate = (date: string) => {
    setStartTouched(true);
    setStartDate(date);
  };

  const activePattern = parsedDays ?? current?.days ?? null;
  const activePresentSlots = parsedDays ? parsedPresentSlots : current?.presentSlots ?? [];
  const activeFilename = parsedDays ? parsedFilename : current?.filename ?? "";
  const patternLength = activePattern?.length ?? 0;

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
    if (result.days.length === 0) {
      setStatus("error");
      setErrorMsg(result.warnings[0] ?? "패턴을 읽지 못했어요.");
      return;
    }

    setParsedDays(result.days);
    setParsedPresentSlots(result.presentSlots);
    setParsedFilename(file.name);
    // 하루 새벽/야간 2인1조 확인은 저장을 막지 않는 참고용 안내라 warnings에 합친다
    // (인원수·일수가 제각각인 패턴을 그대로 올려 적용할 수 있어야 해서, 총 개수는 더 이상
    // 검증하지 않는다).
    setWarnings([...result.warnings, ...validatePattern(result.days)]);
    setValidationErrors([]);
    setStatus("parsed");
  };

  // 생성·다운로드는 DB에 저장하지 않는 작업이라 일반 사용자(조회 전용)도 해볼 수 있다.
  const handleGenerate = () => {
    setErrorMsg(null);
    setSummary(null);

    const result = generateShiftPattern({
      employeeCount: genEmployeeCount,
      cycleMultiplier: genCycleMultiplier,
    });
    if ("error" in result) {
      setStatus("error");
      setErrorMsg(result.error);
      return;
    }

    const errors = verifyGeneratedPattern(result);
    const stamp = new Date()
      .toISOString()
      .slice(0, 16)
      .replace(/[-T:]/g, "")
      .replace(/(\d{8})(\d{4})/, "$1-$2");

    setParsedDays(result.days);
    setParsedPresentSlots(result.presentSlots);
    setParsedFilename(`자동생성-${result.employeeCount}명-${result.totalDays}일-${stamp}`);
    setWarnings([]);
    setValidationErrors(errors);
    setStatus("parsed");
  };

  // 시스템 반영은 "패턴 업로드" 탭에서만 — 자동 생성한 패턴은 반드시 엑셀로 내려받아 확인한
  // 다음 업로드 탭에서 올려야 한다(생성 결과를 바로 반영·적용하는 실수 방지).
  const handleSavePattern = () => {
    if (mode !== "upload" || !parsedDays || validationErrors.length > 0) return;
    setSaveConfirmOpen(true);
  };

  const runSavePattern = async () => {
    setSaveConfirmOpen(false);
    if (!parsedDays) return;
    setStatus("saving");
    const { error } = await uploadPattern(parsedFilename, parsedDays, parsedPresentSlots);
    if (error) {
      setStatus("error");
      setErrorMsg(`패턴 반영 실패: ${error}`);
      return;
    }
    setParsedDays(null);
    setParsedPresentSlots([]);
    setParsedFilename("");
    setStatus("idle");
    setSummary("패턴이 시스템에 반영됐어요. 아래에서 적용할 날짜를 선택해주세요.");
    showToast("반영 완료!");
  };

  const handleDownloadPattern = async () => {
    if (!parsedDays) return;
    await downloadPatternExcel(
      parsedDays,
      parsedPresentSlots,
      `${parsedFilename || "GMS근무패턴"}.xlsx`
    );
    showToast("다운로드 완료!");
  };

  const totalDays = Math.max(1, cycles) * patternLength;
  const endDate = format(addDays(parseLocalDate(startDate), totalDays - 1), "yyyy-MM-dd");

  // 주기 시작일이면 가벼운 확인, 주기 중간이면 확인 문구를 직접 입력해야 진행된다.
  const handleApply = () => {
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
    setApplyConfirm(alignment && !alignment.aligned ? "midCycle" : "normal");
  };

  const runApply = async () => {
    setApplyConfirm(null);
    if (!activePattern) return;
    const { rows, clearedCells } = generatePatternRows(
      activePattern,
      activePresentSlots,
      employees,
      startDate,
      endDate,
      shiftDefaults
    );

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
      showToast("적용 완료!");
    });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[3px] animate-[fadeIn_150ms_ease-out]" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col animate-[popIn_150ms_ease-out]">
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <h2 className="font-semibold text-base">근무패턴 관리</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-black text-lg leading-none rounded-md p-1 transition-all duration-150 hover:bg-gray-100 hover:scale-110"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
          <>
              {!canEdit && <ReadOnlyNotice />}
              <div className="flex gap-1.5">
                {(
                  [
                    ["upload", "패턴 업로드"],
                    ["generate", "패턴 자동 생성"],
                  ] as [Mode, string][]
                ).map(([m, label]) => (
                  <Button
                    key={m}
                    active={mode === m}
                    onClick={() => {
                      if (mode !== m) {
                        setMode(m);
                        reset();
                      }
                    }}
                    className="text-sm px-2.5 py-1"
                  >
                    {label}
                  </Button>
                ))}
              </div>

              {mode === "upload" && current && !parsedDays && (
                <div className="text-sm text-black bg-gray-50 border rounded-lg px-3 py-2">
                  <p className="font-medium text-black mb-0.5">현재 등록된 패턴</p>
                  <p>파일명: {current.filename}</p>
                  <p>업로더: {current.uploadedByEmail ?? "알 수 없음"}</p>
                  <p>업로드 시각: {new Date(current.uploadedAt).toLocaleString("ko-KR")}</p>
                </div>
              )}

              {mode === "upload" && latestApplication && !parsedDays && (
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
                  <p className="text-sm text-blue-200 mt-1.5">
                    적용: {latestApplication.appliedByEmail ?? "알 수 없음"} ·{" "}
                    {new Date(latestApplication.appliedAt).toLocaleString("ko-KR")}
                  </p>
                </div>
              )}

              {mode === "upload" && canEdit && (
                <div className="space-y-2 border-2 border-blue-100 rounded-lg p-3 bg-blue-50/30">
                  <p className="text-sm font-semibold text-blue-900">엑셀 파일로 패턴 올리기</p>
                  <div className="text-sm text-black leading-relaxed">
                    <p>· A열: 참고용(무시)</p>
                    <p>· B열~: 1행 근무자 글자(A,B,C...), 2행부터 패턴(메/조/야/여/주/휴/대) 입력</p>
                    <p>· 열 순서 무관, 인원수·일수 제한 없음 (1행 글자로 매칭)</p>
                    <p>· 상대적 며칠차 패턴 — 적용 시 시작일 선택 후 반복 적용</p>
                  </div>
                  <Image
                    src="/pattern-excel-example.png"
                    alt="근무패턴 엑셀 양식 예시 (B열부터 근무자별 패턴 코드)"
                    width={452}
                    height={473}
                    className="w-full max-w-[240px] h-auto rounded-lg border"
                  />
                  <div className="text-sm text-black bg-white border rounded-lg px-3 py-2 leading-relaxed">
                    <p className="font-medium text-black mb-0.5">참고 안내 (저장을 막진 않아요)</p>
                    <p>· 하루(행)마다 메·조·야·여 각 1개씩(기본)</p>
                  </div>
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
                  {parsedDays && (
                    <p className="text-sm text-blue-900">
                      다른 파일을 올리려면 아래에서 &quot;취소&quot;를 먼저 눌러주세요.
                    </p>
                  )}
                </div>
              )}

              {mode === "generate" && (
                <div className="space-y-2 border-2 border-emerald-100 rounded-lg p-3 bg-emerald-50/30">
                  <p className="text-sm font-semibold text-emerald-900">
                    <span className="text-emerald-700 font-extrabold">GMS</span> 근무패턴 생성
                  </p>
                  <div className="text-sm text-black bg-white border rounded-lg px-3 py-2 leading-relaxed">
                    <p className="font-medium text-black mb-0.5">자동 생성 규칙</p>
                    <p>· 하루(행)마다 메·조·야·여 각 1명씩(새벽·야간 2인1조)</p>
                    <p>· 근무자 전원 메·조·야·여·주·휴·대 개수 동일(공평 배분)</p>
                    <p>· 7일 연속 근무 금지, 야간 다음날 새벽 금지</p>
                    <p>· 휴(주말 휴무)는 6·7일차(토·일)에만, 주·대(주간근무/평일 휴무)는 1~5일차(평일)에만</p>
                    <p>· 평일 5일근무·주말 2일휴무 기준 — 근무자 1명당 휴+대는 7일(1주)마다 2일</p>
                    <p>· 최소 {MIN_EMPLOYEES}명부터, 생성할 때마다 다른 결과</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div>
                      <label className="text-sm text-blue-900 block mb-0.5">근무자 수</label>
                      <input
                        type="number"
                        min={MIN_EMPLOYEES}
                        max={50}
                        value={genEmployeeCount}
                        onChange={(e) => setGenEmployeeCount(Number(e.target.value))}
                        className="w-20 border rounded-lg px-2 py-1.5 text-sm bg-white transition-shadow duration-150 focus:outline-none focus:ring-1 focus:ring-gray-300"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-blue-900 block mb-0.5">주기 배수 (×7일)</label>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={genCycleMultiplier}
                        onChange={(e) => setGenCycleMultiplier(Number(e.target.value))}
                        className="w-20 border rounded-lg px-2 py-1.5 text-sm bg-white transition-shadow duration-150 focus:outline-none focus:ring-1 focus:ring-gray-300"
                      />
                    </div>
                  </div>
                  <p className="text-sm text-black">
                    총 {Math.max(1, genCycleMultiplier) * Math.max(MIN_EMPLOYEES, genEmployeeCount) * 7}일치
                    패턴이 만들어져요.
                  </p>
                  <Button variant="primary" onClick={handleGenerate} className="w-full py-2">
                    {parsedDays ? "다시 생성 (새 결과로 미리보기 갱신)" : "패턴 생성"}
                  </Button>
                </div>
              )}

              {status === "parsing" && <p className="text-black">읽는 중...</p>}
              {(status === "saving" || status === "applying") && (
                <p className="text-black">{status === "saving" ? "반영 중..." : "적용 중..."}</p>
              )}
              {summary && <p className="text-green-600">{summary}</p>}
              {errorMsg && <p className="text-red-600">{errorMsg}</p>}
              {status === "error" && (
                <Button onClick={reset} className="text-sm px-2.5 py-1">
                  다시 시도
                </Button>
              )}

              {parsedDays && (
                <div className="space-y-2 border-t pt-3">
                  <p className="text-sm font-medium text-black">
                    미리보기 — {mode === "generate" ? "다운로드" : "저장"} 전 내용을 확인해주세요
                  </p>
                  <PatternPreviewTable days={parsedDays} presentSlots={parsedPresentSlots} />
                  <p className="text-sm font-medium text-black">근무자별 근무 일수</p>
                  <PatternCategoryCounts days={parsedDays} presentSlots={parsedPresentSlots} />
                </div>
              )}

              {parsedDays && validationErrors.length === 0 && warnings.length === 0 && (
                <p className="text-sm font-medium text-green-700 bg-green-50 border border-green-300 rounded-lg px-3 py-2">
                  ✓ {parsedPresentSlots.filter(Boolean).length}명 {parsedDays.length}일 검증 결과 이상 없음
                </p>
              )}

              {validationErrors.length > 0 && parsedDays && (
                <div className="border border-red-300 bg-red-50 rounded-lg p-2 max-h-40 overflow-y-auto">
                  <p className="text-sm font-medium text-red-800 mb-1">
                    생성된 패턴이 조건을 만족하지 못했어요 ({validationErrors.length}건). 다시
                    생성해주세요.
                  </p>
                  <ul className="text-sm text-red-700 space-y-0.5">
                    {validationErrors.slice(0, 50).map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {warnings.length > 0 && parsedDays && (
                <div className="border border-amber-300 bg-amber-50 rounded-lg p-2 max-h-32 overflow-y-auto">
                  <p className="text-sm font-medium text-amber-800 mb-1">확인 필요 {warnings.length}건</p>
                  <ul className="text-sm text-amber-700 space-y-0.5">
                    {warnings.slice(0, 30).map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {parsedDays && mode === "upload" && (
                <div className="space-y-1.5">
                  <p className="text-sm text-blue-900">
                    · &quot;패턴 시스템에 반영&quot;은 눌러서 확인하면 바로 반영돼요(다른 사용자도 바로 조회 가능)
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="primary"
                      onClick={handleSavePattern}
                      disabled={validationErrors.length > 0}
                      className="flex-1 py-2"
                    >
                      {validationErrors.length > 0 ? "패턴이 유효하지 않아 반영 불가" : "패턴 시스템에 반영"}
                    </Button>
                    <Button onClick={reset} className="py-2">
                      취소
                    </Button>
                  </div>
                </div>
              )}

              {parsedDays && mode === "generate" && (
                <div className="space-y-2">
                  <div className="rounded-lg border-2 border-blue-900 bg-blue-50 px-3 py-2 text-sm text-blue-950 space-y-1">
                    <p className="font-bold">생성한 패턴은 바로 반영되지 않아요</p>
                    <p>
                      ① 아래 &quot;패턴 다운로드&quot;로 엑셀을 받아 내용을 확인하고 → ② &quot;패턴 업로드&quot;
                      탭에서 그 파일을 올려 시스템에 반영한 뒤 → ③ 다음 주기 시작일에 맞춰 적용해주세요.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="primary"
                      onClick={handleDownloadPattern}
                      disabled={validationErrors.length > 0}
                      className="flex-1 py-2"
                    >
                      {validationErrors.length > 0 ? "패턴이 유효하지 않아 다운로드 불가" : "패턴 다운로드"}
                    </Button>
                    <Button onClick={reset} className="py-2">
                      취소
                    </Button>
                  </div>
                </div>
              )}

              {mode === "upload" && activePattern && !parsedDays && (
                <>
                  <PatternPreviewTable days={activePattern} presentSlots={activePresentSlots} />
                  <p className="text-sm font-medium text-black">근무자별 근무 일수</p>
                  <PatternCategoryCounts days={activePattern} presentSlots={activePresentSlots} />

                  {(canEdit || (cycle && detected)) && (
                  <div className="space-y-3 border-t pt-3">
                    <p className="text-sm font-medium text-black">
                      {canEdit ? <>&quot;{activeFilename}&quot; 패턴 적용</> : "현재 패턴 주기"}
                    </p>

                    {cycle && detected && <CycleProgressCard cycle={cycle} matchRate={detected.matchRate} />}

                    {canEdit && (
                    <>
                    <div className="flex items-end gap-2 flex-wrap">
                      <div>
                        <label className="text-sm text-blue-900 block mb-0.5">시작일</label>
                        <input
                          type="date"
                          value={startDate}
                          onChange={(e) => chooseStartDate(e.target.value)}
                          className="border rounded-lg px-2 py-1.5 text-sm transition-shadow duration-150 focus:outline-none focus:ring-1 focus:ring-gray-300"
                        />
                      </div>
                      <div>
                        <label className="text-sm text-blue-900 block mb-0.5">
                          패턴 반복 횟수 ({patternLength}일 × N회)
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
                      {cycle && (
                        <div className="flex gap-1.5">
                          <Button
                            onClick={() => chooseStartDate(cycle.nextCycleStart)}
                            active={startDate === cycle.nextCycleStart}
                            className="text-xs px-2 py-1.5"
                          >
                            다음 주기 {formatMonthDay(cycle.nextCycleStart)}
                          </Button>
                          <Button
                            onClick={() => chooseStartDate(cycle.followingCycleStart)}
                            active={startDate === cycle.followingCycleStart}
                            className="text-xs px-2 py-1.5"
                          >
                            그다음 주기 {formatMonthDay(cycle.followingCycleStart)}
                          </Button>
                        </div>
                      )}
                    </div>
                    <p className="text-sm text-black">
                      총 {totalDays}일 적용 · {startDate} ~ {endDate}
                    </p>

                    {alignment ? (
                      alignment.aligned ? (
                        <div className="rounded-lg border-2 border-green-500 bg-green-50 px-3 py-2 text-sm text-green-800">
                          <p className="font-bold">✓ 주기 시작일에 맞췄어요</p>
                          <p className="mt-0.5">
                            {startDate === nextCycleStart
                              ? "진행 중인 주기가 끝난 다음 날부터 새 패턴이 이어져요."
                              : "주기 첫날이라 근무 순서가 어긋나지 않아요."}
                          </p>
                        </div>
                      ) : (
                        <div className="rounded-lg border-2 border-red-500 bg-red-50 px-3 py-2 text-sm text-red-800 space-y-1.5">
                          <p className="font-bold text-base">
                            ⚠️ 진행 중인 주기의 {alignment.dayInCycle}일차예요
                          </p>
                          <p>
                            주기 중간에 새 패턴을 넣으면 근무자별 휴무·대휴 개수와 근무 순서가 어긋나고,
                            연속 근무가 생길 수 있어요. 현재 주기가 끝난 다음 날부터 적용하는 걸 권장해요.
                          </p>
                          {nextCycleStart && (
                            <Button
                              onClick={() => chooseStartDate(nextCycleStart)}
                              className="text-xs px-2 py-1"
                            >
                              다음 주기 시작일({formatMonthDay(nextCycleStart)})로 맞추기
                            </Button>
                          )}
                        </div>
                      )
                    ) : (
                      <p className="text-sm font-bold text-red-600">
                        반드시 패턴 시작일을 확인하여 적용하세요.
                      </p>
                    )}

                    <Button
                      variant="danger"
                      onClick={handleApply}
                      disabled={status === "applying"}
                      className="w-full py-2"
                    >
                      {status === "applying"
                        ? "적용 중..."
                        : alignment && !alignment.aligned
                        ? "그래도 이 날짜부터 적용"
                        : "적용"}
                    </Button>
                    </>
                    )}
                  </div>
                  )}
                </>
              )}
          </>
        </div>
      </div>

      <ConfirmDialog
        open={saveConfirmOpen}
        title="패턴 시스템에 반영"
        message="누르면 시스템에 반영된 패턴이 현재 생성된 패턴으로 새로 저장됩니다. 저장하겠습니까?"
        confirmLabel="저장"
        onConfirm={runSavePattern}
        onCancel={() => setSaveConfirmOpen(false)}
      />
      <ConfirmDialog
        open={applyConfirm === "normal"}
        title="근무패턴 적용"
        message={`${startDate} ~ ${endDate} 기간에 이 패턴을 적용할까요?\n이 기간에 이미 있던 근무 기록은 지워지고 패턴 내용으로 대체돼요(빈칸인 근무자·날짜는 기존 기록만 삭제돼요). 되돌릴 수 없어요.`}
        confirmLabel="적용"
        onConfirm={runApply}
        onCancel={() => setApplyConfirm(null)}
      />
      <ConfirmPhraseDialog
        open={applyConfirm === "midCycle"}
        title="주기 중간에 근무패턴 적용"
        message={`진행 중인 주기의 ${alignment?.dayInCycle ?? ""}일차(${startDate})부터 새 패턴을 적용해요. 근무자별 휴무·대휴 개수와 근무 순서가 어긋날 수 있어요.${nextCycleStart ? `\n권장 시작일: ${nextCycleStart} (다음 주기 시작)` : ""}\n${startDate} ~ ${endDate}의 기존 근무 기록은 지워지고 되돌릴 수 없어요.`}
        phrase="주기중간적용"
        danger
        onConfirm={runApply}
        onCancel={() => setApplyConfirm(null)}
      />
    </div>
  );
}
