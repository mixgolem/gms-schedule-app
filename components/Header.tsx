"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/providers";
import EmployeeManagerModal from "./EmployeeManagerModal";
import UploadScheduleModal from "./UploadScheduleModal";
import Button from "./ui/Button";

export default function Header() {
  const { session, signOut, loading } = useAuth();
  const [managerOpen, setManagerOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  return (
    <header className="flex items-center justify-between px-4 py-3 border-b bg-white">
      <span className="font-semibold">GMS 근무 스케줄</span>
      {!loading && (
        <div className="text-sm">
          {session ? (
            <div className="flex items-center gap-3">
              <span className="text-gray-500">{session.user.email}</span>
              <Button onClick={() => setManagerOpen(true)}>직원 관리</Button>
              <Button onClick={() => setUploadOpen(true)}>근무표 업로드</Button>
              <Button onClick={signOut}>로그아웃</Button>
            </div>
          ) : (
            <Link
              href="/login"
              className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-all duration-150 ease-out hover:-translate-y-0.5 hover:border-gray-300 hover:bg-gray-50 hover:shadow-sm active:translate-y-0"
            >
              로그인
            </Link>
          )}
        </div>
      )}

      <EmployeeManagerModal open={managerOpen} onClose={() => setManagerOpen(false)} />
      <UploadScheduleModal open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </header>
  );
}
