import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "../components/AuthProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: {
    default: "실험 프렙 (가제) — 논문 실험 방법을 계량표로",
    template: "%s · 실험 프렙 (가제)",
  },
  description:
    "논문의 Methods를 붙여넣으면 시약별 계량값, 실행 순서 타임라인, 총 소요 시간을 계산해 드리는 실험 준비 도구",
};

// 확대·축소를 막지 않는다(maximumScale 를 두지 않는다)
export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#111113" },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko" className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      <body className="min-h-screen">
        <a
          href="#main"
          className="fixed left-4 top-4 z-50 -translate-y-24 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-brand-ink no-underline focus:translate-y-0"
        >
          본문 바로가기
        </a>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
