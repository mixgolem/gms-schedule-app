"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/app/providers";
import EmployeeManagerModal from "./EmployeeManagerModal";
import UploadScheduleModal from "./UploadScheduleModal";

export default function Header() {
  const { session, signOut, loading } = useAuth();
  const [managerOpen, setManagerOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  return (
    <header className="flex items-center justify-between px-4 py-3 border-b bg-white">
      <div className="flex items-center gap-2">
        <span className="font-semibold">GMS 근무 스케줄</span>
        <Image
          src="/ksl.png"
          alt="KSL 로고"
          width={28}
          height={28}
          className="h-7 w-7 object-contain"
        />
      </div>
      {!loading && (
        <div className="text-sm">
          {session ? (
            <div className="flex items-center gap-3">
              <span className="text-gray-500">{session.user.email}</span>
              <button
                onClick={() => setManagerOpen(true)}
                className="px-3 py-1 rounded border hover:bg-gray-50"
              >
                직원 관리
              </button>
              <button
                onClick={() => setUploadOpen(true)}
                className="px-3 py-1 rounded border hover:bg-gray-50"
              >
                엑셀 업로드
              </button>
              <button
                onClick={signOut}
                className="px-3 py-1 rounded border hover:bg-gray-50"
              >
                로그아웃
              </button>
            </div>
          ) : (
            <Link href="/login" className="px-3 py-1 rounded border hover:bg-gray-50">
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
