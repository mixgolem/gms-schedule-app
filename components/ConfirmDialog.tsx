"use client";

import Button from "./ui/Button";

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

// 되돌릴 순 있지만 다른 사용자에게도 바로 영향을 주는 작업(패턴 시스템 반영 등) 실행 전에,
// window.confirm 대신 이 앱 스타일에 맞는 팝업으로 한 번 더 확인받는다. 문구 입력까지
// 요구할 정도는 아닌 가벼운 확인이라 연노란색 경고 문구 + 확인/취소 버튼만 둔다.
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "확인",
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[3px] animate-[fadeIn_150ms_ease-out]"
        onClick={onCancel}
      />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-4 space-y-3 animate-[popIn_150ms_ease-out]">
        <p className="font-semibold text-sm text-black">{title}</p>
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 whitespace-pre-line leading-relaxed">
          ⚠️ {message}
        </p>
        <div className="flex gap-2">
          <Button variant="primary" onClick={onConfirm} className="flex-1 py-2">
            {confirmLabel}
          </Button>
          <Button onClick={onCancel} className="py-2">
            취소
          </Button>
        </div>
      </div>
    </div>
  );
}
