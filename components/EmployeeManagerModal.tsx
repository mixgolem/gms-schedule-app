"use client";

import { useState } from "react";
import { useEmployees } from "@/lib/useEmployees";
import { employeeLabel } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function EmployeeManagerModal({ open, onClose }: Props) {
  const { employees, loading, addEmployee, renameEmployee, setActive, moveEmployee } =
    useEmployees();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  if (!open) return null;

  const sorted = [...employees].sort((a, b) => a.sort_order - b.sort_order);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    await addEmployee(name);
    setNewName("");
  };

  const startEdit = (id: string, name: string) => {
    setEditingId(id);
    setEditingName(name);
  };

  const commitEdit = async () => {
    if (editingId && editingName.trim()) {
      await renameEmployee(editingId, editingName.trim());
    }
    setEditingId(null);
    setEditingName("");
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <h2 className="font-semibold text-sm">직원 관리</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-lg leading-none"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <p className="text-sm text-gray-400">불러오는 중...</p>
          ) : (
            sorted.map((emp, i) => (
              <div
                key={emp.id}
                className={`flex items-center gap-2 border rounded px-2 py-2 ${
                  emp.active ? "bg-white" : "bg-gray-50 opacity-60"
                }`}
              >
                <span className="w-5 text-xs font-semibold text-gray-400 shrink-0">
                  {employeeLabel(i)}
                </span>

                {editingId === emp.id ? (
                  <input
                    autoFocus
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && commitEdit()}
                    onBlur={commitEdit}
                    className="flex-1 border rounded px-2 py-1 text-sm"
                  />
                ) : (
                  <span
                    className="flex-1 text-sm cursor-pointer"
                    onClick={() => startEdit(emp.id, emp.name)}
                    title="클릭해서 이름 수정"
                  >
                    {emp.name}
                  </span>
                )}

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    title="위로"
                    onClick={() => moveEmployee(emp.id, "up")}
                    disabled={i === 0}
                    className="w-6 h-6 text-xs border rounded hover:bg-gray-50 disabled:opacity-30"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    title="아래로"
                    onClick={() => moveEmployee(emp.id, "down")}
                    disabled={i === sorted.length - 1}
                    className="w-6 h-6 text-xs border rounded hover:bg-gray-50 disabled:opacity-30"
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    onClick={() => setActive(emp.id, !emp.active)}
                    className="text-xs border rounded px-2 py-1 hover:bg-gray-50"
                  >
                    {emp.active ? "비활성화" : "활성화"}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="border-t p-3 flex gap-2 shrink-0">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="새 직원 이름"
            className="flex-1 border rounded px-2 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={handleAdd}
            className="bg-gray-900 text-white text-sm rounded px-3 py-1.5"
          >
            추가
          </button>
        </div>
      </div>
    </div>
  );
}
