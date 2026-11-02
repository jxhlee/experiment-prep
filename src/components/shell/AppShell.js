"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { ExperimentProvider, useExperiment } from "../ExperimentProvider";
import { focusSoon } from "../tool/focus";
import { MobileNav, Sidebar } from "./Navigation";
import Topbar from "./Topbar";

// 페이지를 옮기면 새 페이지의 제목으로 키보드 포커스를 옮겨, 화면 낭독기와 키보드 사용자가 바뀐 것을 바로 알게 한다
function RouteFocus() {
  const pathname = usePathname();
  const previous = useRef(pathname);
  useEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;
    focusSoon("page-title");
  }, [pathname]);
  return null;
}

function LiveRegion() {
  const { liveMessage } = useExperiment();
  return (
    <div role="status" aria-live="polite" className="sr-only">
      {liveMessage}
    </div>
  );
}

export default function AppShell({ children }) {
  return (
    <ExperimentProvider>
      <div className="min-h-screen lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
        <Sidebar />
        <div className="flex min-w-0 flex-col">
          <Topbar />
          <main id="main" tabIndex={-1} className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 pb-28 focus:outline-none sm:px-6 lg:px-8 lg:pb-12">
            {children}
          </main>
        </div>
      </div>
      <MobileNav />
      <RouteFocus />
      <LiveRegion />
    </ExperimentProvider>
  );
}
