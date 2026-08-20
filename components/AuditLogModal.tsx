"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/providers";
import { useEmployees } from "@/lib/useEmployees";
import {
  fetchAuditLog,
  describeAuditEntry,
  groupIntoBatches,
  summarizeBatch,
  TABLE_LABELS,
  OPERATION_LABELS,
  AuditLogEntry,
} from "@/lib/auditLog";

interface Props {
  open: boolean;
  onClose: () => void;
}

const OPERATION_BADGE_CLASS: Record<string, string> = {
  INSERT: "bg-green-100 text-green-800",
  UPDATE: "bg-blue-100 text-blue-800",
  DELETE: "bg-red-100 text-red-800",
};

const TABLE_FILTERS = ["all", "shifts", "holidays", "employees", "shift_leave_usage"] as const;

function OperationBadge({ entry }: { entry: AuditLogEntry }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium whitespace-nowrap ${OPERATION_BADGE_CLASS[entry.operation]}`}
    >
      {TABLE_LABELS[entry.tableName] ?? entry.tableName}·{OPERATION_LABELS[entry.operation]}
    </span>
  );
}

export default function AuditLogModal({ open, onClose }: Props) {
  const { session } = useAuth();
  const canView = !!session;
  const { employees } = useEmployees();
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [tableFilter, setTableFilter] = useState<(typeof TABLE_FILTERS)[number]>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open || !canView) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setErrorMsg(null);
    fetchAuditLog()
      .then((rows) => {
        if (!cancelled) setEntries(rows);
      })
      .catch((e) => {
        if (!cancelled) setErrorMsg(e instanceof Error ? e.message : "불러오지 못했어요.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, canView]);

  const employeeNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of employees) map.set(e.id, e.name);
    return map;
  }, [employees]);

  const filtered =
    tableFilter === "all" ? entries : entries.filter((e) => e.tableName === tableFilter);
  const batches = useMemo(() => groupIntoBatches(filtered), [filtered]);

  const toggleExpanded = (batchId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(batchId)) next.delete(batchId);
      else next.add(batchId);
      return next;
    });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[3px] animate-[fadeIn_150ms_ease-out]" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col animate-[popIn_150ms_ease-out]">
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <h2 className="font-semibold text-sm">변경 이력</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-black text-lg leading-none rounded-md p-1 transition-all duration-150 hover:bg-gray-100 hover:scale-110"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
          {!canView ? (
            <p className="text-red-500">로그인한 사용자만 볼 수 있어요.</p>
          ) : (
            <>
              <p className="text-xs text-black">
                근무표/공휴일/직원/부분사용 정보가 언제, 누가, 무엇을 바꿨는지 최근 300건까지
                보여줘요. 같은 사람이 짧은 시간 안에 한꺼번에 바꾼 건 하나로 묶어서 보여줘요.
              </p>

              <div className="flex gap-1 flex-wrap">
                {TABLE_FILTERS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTableFilter(t)}
                    className={`text-xs px-2.5 py-1 rounded-lg border transition-colors duration-150 ${
                      tableFilter === t
                        ? "bg-blue-900 text-white border-blue-900"
                        : "bg-white text-black border-gray-300 hover:bg-gray-100"
                    }`}
                  >
                    {t === "all" ? "전체" : TABLE_LABELS[t]}
                  </button>
                ))}
              </div>

              {loading && <p className="text-black">불러오는 중...</p>}
              {errorMsg && <p className="text-red-600">{errorMsg}</p>}

              {!loading && !errorMsg && (
                <div className="border rounded-lg overflow-hidden">
                  <table className="text-xs w-full">
                    <thead className="sticky top-0 bg-gray-50">
                      <tr>
                        <th className="px-2 py-1.5 text-left border-b whitespace-nowrap">시각</th>
                        <th className="px-2 py-1.5 text-left border-b whitespace-nowrap">사용자</th>
                        <th className="px-2 py-1.5 text-left border-b whitespace-nowrap">구분</th>
                        <th className="px-2 py-1.5 text-left border-b">내용</th>
                      </tr>
                    </thead>
                    <tbody>
                      {batches.map((batch) => {
                        const isGroup = batch.entries.length > 1;
                        const isOpen = expanded.has(batch.id);

                        if (!isGroup) {
                          const entry = batch.entries[0];
                          return (
                            <tr
                              key={batch.id}
                              className="border-b last:border-b-0 transition-colors duration-150 hover:bg-gray-100"
                            >
                              <td className="px-2 py-1.5 whitespace-nowrap text-black">
                                {new Date(entry.changedAt).toLocaleString("ko-KR")}
                              </td>
                              <td className="px-2 py-1.5 whitespace-nowrap text-black">
                                {entry.changedByEmail ?? "알 수 없음"}
                              </td>
                              <td className="px-2 py-1.5">
                                <OperationBadge entry={entry} />
                              </td>
                              <td className="px-2 py-1.5 text-black">
                                {describeAuditEntry(entry, employeeNameById)}
                              </td>
                            </tr>
                          );
                        }

                        return (
                          <Fragment key={batch.id}>
                            <tr
                              className="border-b last:border-b-0 bg-amber-50 transition-colors duration-150 hover:bg-amber-100 cursor-pointer"
                              onClick={() => toggleExpanded(batch.id)}
                            >
                              <td className="px-2 py-1.5 whitespace-nowrap text-black">
                                {new Date(batch.changedAt).toLocaleString("ko-KR")}
                              </td>
                              <td className="px-2 py-1.5 whitespace-nowrap text-black">
                                {batch.changedByEmail ?? "알 수 없음"}
                              </td>
                              <td className="px-2 py-1.5 whitespace-nowrap text-black font-medium">
                                일괄 작업 {batch.entries.length}건
                              </td>
                              <td className="px-2 py-1.5 text-black">
                                {summarizeBatch(batch.entries)}
                                <span className="text-blue-900 font-medium ml-2">
                                  {isOpen ? "접기 ▴" : "펼쳐보기 ▾"}
                                </span>
                              </td>
                            </tr>
                            {isOpen &&
                              batch.entries.map((entry) => (
                                <tr
                                  key={entry.id}
                                  className="border-b last:border-b-0 bg-gray-50 transition-colors duration-150 hover:bg-gray-100"
                                >
                                  <td className="px-2 py-1.5 whitespace-nowrap text-black pl-6">
                                    {new Date(entry.changedAt).toLocaleTimeString("ko-KR")}
                                  </td>
                                  <td className="px-2 py-1.5 whitespace-nowrap text-black">
                                    {entry.changedByEmail ?? "알 수 없음"}
                                  </td>
                                  <td className="px-2 py-1.5">
                                    <OperationBadge entry={entry} />
                                  </td>
                                  <td className="px-2 py-1.5 text-black">
                                    {describeAuditEntry(entry, employeeNameById)}
                                  </td>
                                </tr>
                              ))}
                          </Fragment>
                        );
                      })}
                      {batches.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-2 py-4 text-center text-black">
                            변경 이력이 없어요.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
