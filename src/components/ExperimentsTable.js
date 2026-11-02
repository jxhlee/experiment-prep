"use client";

import { useState } from "react";
import { Icon } from "./icons";
import { Alert, Badge, Button } from "./ui";

const formatDate = (iso) =>
  new Date(iso).toLocaleString("ko-KR", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

/** 저장한 실험 목록. 홈(최근 몇 개)과 '내 실험' 화면이 함께 쓴다. */
export default function ExperimentsTable({ items, loading, error, currentId, onOpen, onDelete, limit, caption }) {
  const [confirmId, setConfirmId] = useState(null);
  const shown = limit ? items.slice(0, limit) : items;

  return (
    <div aria-busy={loading}>
      {error && <Alert kind="error">{error}</Alert>}
      {loading && shown.length === 0 && (
        <p role="status" className="py-6 text-center text-sm text-ink-muted">
          불러오는 중…
        </p>
      )}
      {!loading && !error && shown.length === 0 && (
        <p role="status" className="py-6 text-center text-sm text-ink-muted">
          저장한 실험이 아직 없어요. 확인 화면이나 결과 화면에서 저장해 보세요.
        </p>
      )}
      {shown.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-line">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">{caption}</caption>
            <thead className="bg-surface-2 text-ink-muted">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  실험 이름
                </th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium sm:table-cell">
                  마지막 수정
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">
                  <span className="sr-only">작업</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((item) => {
                const title = item.title || "(이름 없음)";
                return (
                  <tr key={item.id} className="border-t border-line align-middle">
                    <th scope="row" className="px-4 py-3 font-medium text-ink">
                      <span className="break-words">{title}</span>
                      {item.id === currentId && (
                        <Badge tone="accent" className="ml-2">
                          작업 중
                        </Badge>
                      )}
                      <span className="mt-0.5 block text-sm font-normal text-ink-muted sm:hidden">
                        <span className="sr-only">마지막으로 고친 때: </span>
                        {formatDate(item.updated_at)}
                      </span>
                    </th>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-ink-muted sm:table-cell">{formatDate(item.updated_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button size="sm" variant="secondary" onClick={() => onOpen(item.id)} aria-label={`${title} 불러오기`}>
                          불러오기
                        </Button>
                        {onDelete &&
                          (confirmId === item.id ? (
                            <>
                              <Button
                                size="sm"
                                variant="danger"
                                autoFocus
                                aria-label={`${title} 삭제 확인`}
                                onClick={() => {
                                  setConfirmId(null);
                                  onDelete(item.id);
                                }}
                              >
                                정말 삭제
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setConfirmId(null)}>
                                취소
                              </Button>
                            </>
                          ) : (
                            <Button size="sm" variant="ghost" aria-label={`${title} 삭제`} onClick={() => setConfirmId(item.id)}>
                              <Icon name="trash" size={16} />
                            </Button>
                          ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
