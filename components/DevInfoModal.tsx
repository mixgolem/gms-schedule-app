"use client";

import { ReactNode, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/app/providers";
import {
  BUILD_INFO,
  BUILD_ENV_LABELS,
  supabaseProjectRef,
  fetchRecentCommits,
  pingDatabase,
  fetchLastDbChange,
  runSchemaChecks,
  fetchRowCounts,
  CommitSummary,
  LastDbChange,
  SchemaCheckResult,
} from "@/lib/devInfo";
import Button from "./ui/Button";
import LinkButton from "./ui/LinkButton";

interface Props {
  open: boolean;
  onClose: () => void;
}

// 섹션마다 따로 불러오고 따로 실패한다 — GitHub 한도 초과 같은 문제가 DB 정보까지 막지 않게.
type Loadable<T> = { status: "loading" } | { status: "ok"; data: T } | { status: "error"; error: string };

// Supabase 무료 플랜은 약 7일간 활동이 없으면 프로젝트를 일시정지할 수 있다.
const PAUSE_DAYS = 7;
const PAUSE_WARN_DAYS = 5;

function toLoadable<T>(promise: Promise<T>): Promise<Loadable<T>> {
  return promise
    .then((data) => ({ status: "ok" as const, data }))
    .catch((e) => ({ status: "error" as const, error: e instanceof Error ? e.message : String(e) }));
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border rounded-lg p-3 space-y-2">
      <h3 className="text-sm font-bold text-blue-900">{title}</h3>
      {children}
    </section>
  );
}

function SectionBody<T>({ value, children }: { value: Loadable<T>; children: (data: T) => ReactNode }) {
  if (value.status === "loading") return <p className="text-sm text-black">불러오는 중...</p>;
  if (value.status === "error") return <p className="text-sm text-red-600">{value.error}</p>;
  return <>{children(value.data)}</>;
}

export default function DevInfoModal({ open, onClose }: Props) {
  const { session, isAdmin } = useAuth();
  const [commits, setCommits] = useState<Loadable<CommitSummary[]>>({ status: "loading" });
  const [ping, setPing] = useState<Loadable<{ ms: number; error?: string }>>({ status: "loading" });
  const [lastChange, setLastChange] = useState<Loadable<LastDbChange | null>>({ status: "loading" });
  const [schema, setSchema] = useState<Loadable<SchemaCheckResult[]>>({ status: "loading" });
  const [counts, setCounts] = useState<Loadable<{ label: string; count: number }[]>>({
    status: "loading",
  });

  const load = useCallback(() => {
    setCommits({ status: "loading" });
    setPing({ status: "loading" });
    setLastChange({ status: "loading" });
    setSchema({ status: "loading" });
    setCounts({ status: "loading" });

    const repoPromise = BUILD_INFO.repo
      ? fetchRecentCommits(BUILD_INFO.repo)
      : Promise.reject(new Error("저장소 정보를 알 수 없어요."));
    toLoadable(repoPromise).then(setCommits);
    toLoadable(pingDatabase()).then(setPing);
    toLoadable(fetchLastDbChange()).then(setLastChange);
    toLoadable(runSchemaChecks()).then(setSchema);
    toLoadable(fetchRowCounts()).then(setCounts);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) load();
  }, [open, load]);

  if (!open) return null;

  const shortSha = BUILD_INFO.commitSha.slice(0, 7);
  const projectRef = supabaseProjectRef();

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[3px] animate-[fadeIn_150ms_ease-out]" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col animate-[popIn_150ms_ease-out]">
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <h2 className="font-semibold text-base">DEV · 개발자 정보</h2>
          <div className="flex items-center gap-2">
            <Button onClick={load} className="text-sm px-2.5 py-1">
              새로고침
            </Button>
            <button
              type="button"
              onClick={onClose}
              className="text-black text-lg leading-none rounded-md p-1 transition-all duration-150 hover:bg-gray-100 hover:scale-110"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
          <Section title="배포 정보">
            <div className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1">
              <span className="text-blue-900">실행 환경</span>
              <span>{BUILD_ENV_LABELS[BUILD_INFO.env] ?? BUILD_INFO.env}</span>
              <span className="text-blue-900">배포된 버전</span>
              <span>
                <code className="font-mono bg-gray-100 rounded px-1">{shortSha || "알 수 없음"}</code>{" "}
                {BUILD_INFO.commitMessage}
              </span>
              <span className="text-blue-900">빌드 시각</span>
              <span>{BUILD_INFO.builtAt ? formatDateTime(BUILD_INFO.builtAt) : "알 수 없음"}</span>
            </div>
            <DeployStatus commits={commits} />
            <div className="flex gap-2 flex-wrap pt-1">
              {BUILD_INFO.repo && (
                <LinkButton
                  href={`https://github.com/${BUILD_INFO.repo}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm px-2.5 py-1"
                >
                  GitHub 저장소
                </LinkButton>
              )}
              <LinkButton
                href="https://vercel.com/dashboard"
                target="_blank"
                rel="noreferrer"
                className="text-sm px-2.5 py-1"
              >
                Vercel 대시보드
              </LinkButton>
              {projectRef && (
                <LinkButton
                  href={`https://supabase.com/dashboard/project/${projectRef}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm px-2.5 py-1"
                >
                  Supabase 대시보드
                </LinkButton>
              )}
            </div>
          </Section>

          <Section title="최근 업데이트 내역 (GitHub)">
            <SectionBody value={commits}>
              {(list) => (
                <div className="border rounded-lg overflow-auto max-h-64">
                  <table className="w-full text-sm">
                    <tbody>
                      {list.map((c) => (
                        <tr key={c.sha} className="border-b last:border-b-0 align-top">
                          <td className="px-2 py-1 whitespace-nowrap text-black">
                            {formatDateTime(c.date)}
                          </td>
                          <td className="px-2 py-1">
                            {c.message}
                            {c.sha === BUILD_INFO.commitSha && (
                              <span className="ml-1.5 text-xs font-bold text-white bg-blue-900 rounded px-1.5 py-0.5">
                                현재 배포
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-1 whitespace-nowrap">
                            <a
                              href={c.url}
                              target="_blank"
                              rel="noreferrer"
                              className="font-mono text-blue-900 hover:underline"
                            >
                              {c.sha.slice(0, 7)}
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionBody>
          </Section>

          <Section title="DB 상태 (Supabase)">
            <div className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1">
              <span className="text-blue-900">연결</span>
              <SectionBody value={ping}>
                {(p) =>
                  p.error ? (
                    <span className="text-red-600">실패 — {p.error}</span>
                  ) : (
                    <span className="text-green-700">정상 (응답 {p.ms}ms)</span>
                  )
                }
              </SectionBody>
              <span className="text-blue-900">마지막 데이터 변경</span>
              <SectionBody value={lastChange}>
                {(c) => (c ? <LastChangeInfo change={c} /> : <span>변경 기록 없음</span>)}
              </SectionBody>
            </div>
            <p className="text-xs text-black leading-relaxed">
              · 무료 플랜은 약 {PAUSE_DAYS}일 동안 활동이 없으면 일시정지될 수 있어요 (정확한 기준·재개는
              Supabase 대시보드에서 확인)
              <br />· 여기 시각은 근무표·공휴일·직원·부분사용이 바뀐 시각 기준이고, 조회만 한 기록은
              남지 않아요
            </p>
          </Section>

          <Section title="DB 구조 점검 (migration 적용 여부)">
            <SectionBody value={schema}>
              {(results) => {
                const missing = results.filter((r) => !r.ok);
                return (
                  <div className="space-y-2">
                    <p className={missing.length === 0 ? "text-green-700 font-medium" : "text-red-600 font-medium"}>
                      {missing.length === 0
                        ? `✓ 필요한 테이블·컬럼 ${results.length}개 모두 있음`
                        : `✗ ${missing.length}개 누락 — 해당 버전의 supabase/migration SQL 실행 필요`}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                      {results.map((r) => (
                        <span
                          key={`${r.version}-${r.target}`}
                          className={r.ok ? "text-black" : "text-red-600 font-bold"}
                          title={r.error ?? r.target}
                        >
                          {r.ok ? "✓" : "✗"} {r.version} {r.label}{" "}
                          <span className="font-mono text-[11px] opacity-70">{r.target}</span>
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-black">
                      · 제약조건·권한(RLS)만 바꾸는 migration(v9, v14, v17~v19)은 여기서 확인할 수 없어요
                    </p>
                  </div>
                );
              }}
            </SectionBody>
          </Section>

          <Section title="데이터 건수">
            <SectionBody value={counts}>
              {(list) => (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1">
                  {list.map((c) => (
                    <span key={c.label} className="flex justify-between gap-2">
                      <span className="text-black truncate">{c.label}</span>
                      <span className="font-mono">{c.count.toLocaleString()}</span>
                    </span>
                  ))}
                </div>
              )}
            </SectionBody>
          </Section>

          <Section title="내 계정">
            <div className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1">
              <span className="text-blue-900">이메일</span>
              <span>{session?.user.email ?? "-"}</span>
              <span className="text-blue-900">권한</span>
              <span>{isAdmin ? "관리자" : "사용자"}</span>
              <span className="text-blue-900">사용자 ID</span>
              <span className="font-mono text-xs break-all">{session?.user.id ?? "-"}</span>
              <span className="text-blue-900">로그인 만료</span>
              <span>
                {session?.expires_at ? formatDateTime(new Date(session.expires_at * 1000).toISOString()) : "-"}
                <span className="text-xs text-black"> (사용 중에는 자동 연장)</span>
              </span>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function DeployStatus({ commits }: { commits: Loadable<CommitSummary[]> }) {
  if (BUILD_INFO.env === "local") {
    return <p className="text-xs text-black">· 로컬 PC에서 실행 중이라 배포 상태 비교는 생략해요</p>;
  }
  if (commits.status !== "ok" || commits.data.length === 0) return null;

  const latest = commits.data[0];
  if (latest.sha === BUILD_INFO.commitSha) {
    return <p className="text-green-700 font-medium">✓ GitHub 최신 커밋이 배포돼 있어요</p>;
  }
  const behind = commits.data.findIndex((c) => c.sha === BUILD_INFO.commitSha);
  return (
    <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
      ⚠️ GitHub에 아직 배포 안 된 커밋이 {behind === -1 ? `${commits.data.length}개 이상` : `${behind}개`}{" "}
      있어요 — Vercel이 빌드 중이거나 빌드가 실패했을 수 있어요 (새로고침해서 다시 확인)
    </p>
  );
}

function LastChangeInfo({ change }: { change: LastDbChange }) {
  const days = change.daysAgo;
  const level = days >= PAUSE_DAYS ? "danger" : days >= PAUSE_WARN_DAYS ? "warn" : "ok";
  const badgeClass = {
    ok: "text-green-700 bg-green-50 border-green-300",
    warn: "text-amber-700 bg-amber-50 border-amber-300",
    danger: "text-red-700 bg-red-50 border-red-300",
  }[level];
  const badgeText = {
    ok: "정상",
    warn: "곧 일시정지될 수 있음",
    danger: "일시정지 위험",
  }[level];

  return (
    <span className="space-x-1.5">
      <span>{formatDateTime(change.changedAt)}</span>
      <span className="font-bold">({days === 0 ? "오늘" : `${days}일 전`})</span>
      <span className={`text-xs font-bold border rounded px-1.5 py-0.5 ${badgeClass}`}>{badgeText}</span>
      <span className="text-xs text-black">
        · {change.changedByEmail ?? "알 수 없음"} · {change.summary}
      </span>
    </span>
  );
}
