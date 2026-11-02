"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import ExperimentsTable from "../ExperimentsTable";
import { useExperiment } from "../ExperimentProvider";
import RequireLogin from "../RequireLogin";
import { focusSoon } from "../tool/focus";
import { Card, PageHeader } from "../ui";

export default function ExperimentsView() {
  const router = useRouter();
  const { auth, experiments, loadExperiments, openExperiment, removeExperiment, currentId } = useExperiment();
  const userId = auth.user?.id;

  useEffect(() => {
    if (userId) loadExperiments();
  }, [userId, loadExperiments]);

  async function onOpen(id) {
    if (await openExperiment(id)) router.push("/new/result");
  }

  async function onDelete(id) {
    await removeExperiment(id);
    focusSoon("page-title");
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="내 실험" description="저장해 둔 실험을 다시 불러오거나 지울 수 있어요. 불러오면 계산 결과 화면이 열려요." />
      <RequireLogin what="로그인하면 저장한 실험이 이곳에 모여요.">
        <Card>
          <ExperimentsTable
            items={experiments.items}
            loading={experiments.loading}
            error={experiments.error}
            currentId={currentId}
            onOpen={onOpen}
            onDelete={onDelete}
            caption="저장한 실험 목록"
          />
        </Card>
      </RequireLogin>
    </div>
  );
}
