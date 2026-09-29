import type { NextConfig } from "next";
import { execSync } from "child_process";

// DEV 메뉴에서 "지금 배포된 버전"을 보여주기 위한 빌드 시점 정보. Vercel 빌드에서는
// Vercel이 넣어주는 VERCEL_GIT_* 값을, 로컬(npm run dev/build)에서는 git 명령으로 직접 읽는다.
function git(args: string): string {
  try {
    return execSync(`git ${args}`, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
}

function repoFromGitRemote(): string {
  const match = git("remote get-url origin").match(/github\.com[/:]([^/]+\/[^/.]+)/);
  return match ? match[1] : "";
}

const { VERCEL_GIT_COMMIT_SHA, VERCEL_GIT_COMMIT_MESSAGE, VERCEL_GIT_REPO_OWNER, VERCEL_GIT_REPO_SLUG } =
  process.env;

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_COMMIT_SHA: VERCEL_GIT_COMMIT_SHA || git("rev-parse HEAD"),
    NEXT_PUBLIC_BUILD_COMMIT_MESSAGE: (VERCEL_GIT_COMMIT_MESSAGE || git("log -1 --format=%s")).split(
      "\n"
    )[0],
    NEXT_PUBLIC_BUILD_REPO:
      VERCEL_GIT_REPO_OWNER && VERCEL_GIT_REPO_SLUG
        ? `${VERCEL_GIT_REPO_OWNER}/${VERCEL_GIT_REPO_SLUG}`
        : repoFromGitRemote(),
    NEXT_PUBLIC_BUILD_ENV: process.env.VERCEL_ENV || "local",
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },
};

export default nextConfig;
