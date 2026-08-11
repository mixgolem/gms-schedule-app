import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider, ResetMonthProvider } from "./providers";
import Header from "@/components/Header";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GMS 근무 스케줄",
  description: "GMS 당직 근무 스케줄 조회 및 편집",
};

// 모바일도 별도 레이아웃 없이 PC와 똑같은 화면을 그대로 축소해서 보여주고,
// 사용자가 손가락으로 확대/축소해서 보게 한다 (반응형 대신 "축소된 데스크탑 화면" 방식).
export const viewport: Viewport = {
  width: 1600,
  // Next.js가 initialScale을 1로 기본 지정해버려서, 그대로 두면 확대된 채로 시작해버린다.
  // 명시적으로 비워야 모바일 브라우저가 알아서 1600px 레이아웃을 화면 폭에 맞게 축소해서 보여준다.
  initialScale: undefined,
  userScalable: true,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-gray-50">
        <AuthProvider>
          <ResetMonthProvider>
            <Header />
            {children}
          </ResetMonthProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
