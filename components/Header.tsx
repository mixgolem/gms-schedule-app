"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth, useResetMonth } from "@/app/providers";
import EmployeeManagerModal from "./EmployeeManagerModal";
import UploadScheduleModal from "./UploadScheduleModal";
import ShiftDefaultsModal from "./ShiftDefaultsModal";
import FullRestoreModal from "./FullRestoreModal";
import Button from "./ui/Button";
import { exportFullBackupJson } from "@/lib/fullBackupExport";

export default function Header() {
  const { session, signOut, loading } = useAuth();
  const { info: resetInfo } = useResetMonth();
  const [managerOpen, setManagerOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [defaultsOpen, setDefaultsOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);

  const handleFullBackup = async () => {
    const { error } = await exportFullBackupJson();
    if (error) window.alert(error);
  };

  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-blue-950 bg-blue-900">
      <span className="font-semibold text-white">GMS 근무 스케줄</span>
      {!loading && (
        <div className="text-sm">
          {session ? (
            <div className="flex items-center gap-3">
              <span className="text-blue-100">{session.user.email}</span>
              <Button onClick={() => setManagerOpen(true)}>직원 관리</Button>
              <Button onClick={() => setUploadOpen(true)}>근무표 업로드</Button>
              {resetInfo?.canReset && (
                <Button variant="danger" onClick={resetInfo.onReset}>
                  이번 달 초기화
                </Button>
              )}
              <Button onClick={() => setDefaultsOpen(true)}>근무시간 설정</Button>
              <Button
                onClick={handleFullBackup}
                title="직원/근무표/공휴일/공지사항/근무시간설정 등 DB 전체를 있는 그대로 JSON으로 백업해요"
              >
                전체 백업(JSON)
              </Button>
              <Button variant="danger" onClick={() => setRestoreOpen(true)}>
                전체 복원
              </Button>
              <Button onClick={signOut}>로그아웃</Button>
            </div>
          ) : (
            <Link
              href="/login"
              className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-all duration-150 ease-out hover:-translate-y-0.5 hover:border-gray-300 hover:bg-gray-100 hover:shadow-sm active:translate-y-0"
            >
              로그인
            </Link>
          )}
        </div>
      )}

      <EmployeeManagerModal open={managerOpen} onClose={() => setManagerOpen(false)} />
      <UploadScheduleModal open={uploadOpen} onClose={() => setUploadOpen(false)} />
      <ShiftDefaultsModal open={defaultsOpen} onClose={() => setDefaultsOpen(false)} />
      <FullRestoreModal open={restoreOpen} onClose={() => setRestoreOpen(false)} />
    </header>
  );
}
