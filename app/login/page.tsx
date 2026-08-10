"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/providers";
import Button from "@/components/ui/Button";

export default function LoginPage() {
  const { signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error } = await signIn(email, password);
    setSubmitting(false);
    if (error) {
      setError("로그인 실패: 이메일 또는 비밀번호를 확인해주세요.");
      return;
    }
    router.push("/");
  };

  return (
    <div className="max-w-sm mx-auto mt-16 px-4 w-full">
      <h1 className="text-lg font-semibold mb-6">로그인</h1>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="email"
          required
          placeholder="이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm transition-shadow duration-150 focus:outline-none focus:ring-1 focus:ring-gray-300"
        />
        <input
          type="password"
          required
          placeholder="비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm transition-shadow duration-150 focus:outline-none focus:ring-1 focus:ring-gray-300"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" variant="primary" disabled={submitting} className="w-full py-2">
          {submitting ? "로그인 중..." : "로그인"}
        </Button>
      </form>
    </div>
  );
}
