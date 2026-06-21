import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "유연근무제 신청서",
  description: "주간 유연근무 신청서 작성·인쇄·기록",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        <header className="topbar no-print">
          <div className="topbar-inner">
            <span className="brand">유연근무제 신청서</span>
            <nav>
              <Link href="/">신청서 작성</Link>
              <Link href="/history">제출 기록</Link>
            </nav>
          </div>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
