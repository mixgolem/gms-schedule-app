"use client";

import { useState } from "react";
import { useNotice } from "@/lib/useNotice";
import Button from "./ui/Button";

interface Props {
  canEdit: boolean;
}

export default function NoticeBox({ canEdit }: Props) {
  const { content, loading, updateNotice } = useNotice();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    setDraft(content);
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    await updateNotice(draft);
    setSaving(false);
    setEditing(false);
  };

  if (loading) return null;

  return (
    <div className="border rounded-lg px-3 py-2 text-sm transition-shadow duration-150 hover:shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-medium text-black">공지사항</p>
        {canEdit && !editing && (
          <button
            type="button"
            onClick={startEdit}
            className="text-xs text-black rounded-md p-1 transition-all duration-150 hover:text-black hover:bg-gray-100 hover:scale-110"
            title="공지사항 편집"
          >
            ✏️
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-1">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            className="w-full border rounded-lg px-2 py-1 text-xs transition-shadow duration-150 focus:shadow-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
          />
          <div className="flex gap-1">
            <Button
              variant="primary"
              onClick={handleSave}
              disabled={saving}
              className="flex-1 text-xs px-2 py-1"
            >
              {saving ? "저장 중..." : "저장"}
            </Button>
            <Button onClick={() => setEditing(false)} className="text-xs px-2 py-1">
              취소
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-black whitespace-pre-wrap break-words">
          {content || "공지사항 없음"}
        </p>
      )}
    </div>
  );
}
