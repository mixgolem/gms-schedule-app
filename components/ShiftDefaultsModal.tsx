"use client";

import { useEffect, useState } from "react";
import { useShiftDefaults } from "@/lib/useShiftDefaults";
import { SHIFT_LABELS } from "@/lib/types";
import TimeInput24 from "./ui/TimeInput24";
import Button from "./ui/Button";

interface Props {
  open: boolean;
  onClose: () => void;
}

const TYPES: ("dawn" | "day" | "night")[] = ["dawn", "day", "night"];

// 자정을 넘어가는 익일 00:00은 select 드롭다운(00~23)으로 표현할 수 없어 화면에서만 24:00으로 보여줌
function toDisplay(value: string): string {
  return value === "00:00" ? "24:00" : value;
}
function toStored(value: string): string {
  return value === "24:00" ? "00:00" : value;
}

export default function ShiftDefaultsModal({ open, onClose }: Props) {
  const { defaults, loading, setShiftDefault } = useShiftDefaults();
  const [draft, setDraft] = useState(defaults);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) setDraft(defaults);
  }, [open, defaults]);

  if (!open) return null;

  const handleSave = async () => {
    setSaving(true);
    for (const type of TYPES) {
      await setShiftDefault(type, draft[type].start, toStored(draft[type].end));
    }
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 animate-[fadeIn_150ms_ease-out]" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm animate-[popIn_150ms_ease-out]">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="font-semibold text-sm">근무시간 설정</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-lg leading-none rounded-md p-1 transition-all duration-150 hover:bg-gray-100 hover:scale-110"
          >
            ✕
          </button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-xs text-gray-600">
            새벽/주간/야간 근무를 새로 등록할 때 기본으로 채워질 출근·퇴근 시각이에요. 이미 저장된
            근무 기록에는 영향을 주지 않아요.
          </p>
          {loading ? (
            <p className="text-sm text-gray-600">불러오는 중...</p>
          ) : (
            TYPES.map((type) => (
              <div key={type} className="flex items-center justify-between gap-3 border rounded-lg p-2">
                <span className="text-sm font-medium w-10 shrink-0">{SHIFT_LABELS[type]}</span>
                <div className="flex items-center gap-2">
                  <TimeInput24
                    value={draft[type].start}
                    onChange={(v) => setDraft((prev) => ({ ...prev, [type]: { ...prev[type], start: v } }))}
                  />
                  <span className="text-gray-400 text-xs">~</span>
                  <TimeInput24
                    value={toDisplay(draft[type].end)}
                    onChange={(v) => setDraft((prev) => ({ ...prev, [type]: { ...prev[type], end: v } }))}
                  />
                </div>
              </div>
            ))
          )}
        </div>

        <div className="border-t p-3 flex justify-end gap-2">
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? "저장 중..." : "저장"}
          </Button>
        </div>
      </div>
    </div>
  );
}
