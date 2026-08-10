"use client";

import { useState } from "react";

interface Props {
  value: number;
  canEdit: boolean;
  onCommit: (value: number) => void;
}

export default function EditableNumberCell({ value, canEdit, onCommit }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  if (!canEdit) return <span>{value}</span>;

  if (editing) {
    return (
      <input
        type="number"
        step={0.5}
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          const n = Number(draft);
          if (!Number.isNaN(n) && n !== value) onCommit(n);
        }}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className="w-16 border rounded-md px-1 py-0.5 text-xs text-right transition-shadow duration-150 focus:outline-none focus:ring-1 focus:ring-gray-300"
      />
    );
  }

  return (
    <span
      className="inline-flex items-center gap-0.5 cursor-pointer rounded px-1.5 py-0.5 bg-blue-50/50 text-blue-600 border border-dashed border-blue-200 transition-colors duration-150 hover:bg-blue-100/70"
      onClick={() => {
        setDraft(String(value));
        setEditing(true);
      }}
      title="클릭해서 수정"
    >
      {value}
      <span className="text-[10px] opacity-70">✎</span>
    </span>
  );
}
