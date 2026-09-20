"use client";

import { Fragment, useEffect, useState } from "react";
import FormView from "./FormView";
import { apiFetch } from "@/lib/api";
import {
  type Entry,
  DAY_MODE_LABEL,
  formatHM,
  shortDate,
  timeCellText,
  totalCreditMinutes,
} from "@/lib/schedule";

export default function HistoryList({
  title = "제출 기록",
}: {
  title?: string;
}) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const readOnly = false;

  async function load() {
    const res = await apiFetch("/api/entries");
    setEntries(await res.json());
  }

  useEffect(() => {
    load();
  }, []);

  async function remove(id: string) {
    if (!confirm("이 기록을 삭제할까요?")) return;
    await apiFetch(`/api/entries/${id}`, { method: "DELETE" });
    if (open === id) setOpen(null);
    load();
  }

  if (entries === null) return <div className="card muted">불러오는 중…</div>;
  if (entries.length === 0)
    return (
      <div className="card">
        {readOnly && <h2>{title}</h2>}
        <div className="empty">
          {readOnly ? (
            "저장된 기록이 없습니다."
          ) : (
            <>
              아직 저장된 기록이 없습니다.
              <br />
              신청서 작성 화면에서 “저장”을 누르면 여기에 쌓입니다.
            </>
          )}
        </div>
      </div>
    );

  return (
    <div className="card">
      <h2>
        {title} ({entries.length}건)
      </h2>
      <table className="hist">
        <thead>
          <tr>
            <th>신청 기간</th>
            <th>요일별 계획</th>
            <th>합계</th>
            <th>저장일</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => {
            const total = formatHM(totalCreditMinutes(e.days));
            const ok = totalCreditMinutes(e.days) === 40 * 60;
            return (
              <Fragment key={e.id}>
                <tr>
                  <td>
                    <b>
                      {shortDate(e.periodStart)} ~ {shortDate(e.periodEnd)}
                    </b>
                  </td>
                  <td>
                    {e.days.map((d, i) => (
                      <span
                        className="badge"
                        key={i}
                        title={`${d.weekday}: ${timeCellText(d)}`}
                      >
                        {d.weekday[0]} {DAY_MODE_LABEL[d.mode]}
                      </span>
                    ))}
                  </td>
                  <td style={{ color: ok ? "var(--ok)" : "var(--warn)" }}>
                    {total}
                  </td>
                  <td className="muted">
                    {new Date(e.createdAt).toLocaleString("ko-KR", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button
                      className="ghost"
                      onClick={() => setOpen(open === e.id ? null : e.id)}
                    >
                      {open === e.id ? "닫기" : "보기"}
                    </button>
                    <a
                      className="badge"
                      href={`/api/entries/${e.id}/docx`}
                      style={{ cursor: "pointer" }}
                    >
                      Word
                    </a>
                    {!readOnly && (
                      <button className="ghost danger" onClick={() => remove(e.id)}>
                        삭제
                      </button>
                    )}
                  </td>
                </tr>
                {open === e.id && (
                  <tr>
                    <td colSpan={5}>
                      <FormView
                        className="print-preview"
                        settings={e.settings}
                        periodStart={e.periodStart}
                        periodEnd={e.periodEnd}
                        applyDate={e.applyDate}
                        days={e.days}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
