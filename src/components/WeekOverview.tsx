"use client";

import { useEffect, useState } from "react";
import {
  type Entry,
  formatHM,
  hoursCellText,
  nextMonday,
  shortDate,
  thisMonday,
  timeCellText,
  totalCreditMinutes,
} from "@/lib/schedule";

function WeekCard({
  title,
  monday,
  entry,
}: {
  title: string;
  monday: string;
  entry?: Entry;
}) {
  const friday = (() => {
    const d = new Date(monday + "T00:00:00");
    d.setDate(d.getDate() + 4);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  })();

  return (
    <div className="week-card">
      <div className="week-card-head">
        <b>{title}</b>
        <span className="muted">
          {shortDate(monday)} ~ {friday}
        </span>
      </div>
      {entry ? (
        <>
          <table className="week-mini">
            <tbody>
              {entry.days.map((d, i) => (
                <tr key={i}>
                  <td className="wd">{d.weekday[0]}</td>
                  <td>{timeCellText(d)}</td>
                  <td className="hr">{hoursCellText(d)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="week-total">
            계 {formatHM(totalCreditMinutes(entry.days))}
          </div>
        </>
      ) : (
        <div className="week-empty">저장된 계획 없음</div>
      )}
    </div>
  );
}

export default function WeekOverview({ reloadKey }: { reloadKey: number }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const thisMon = thisMonday();
  const nextMon = nextMonday();

  useEffect(() => {
    fetch("/api/entries", { cache: "no-store" })
      .then((r) => r.json())
      .then(setEntries)
      .catch(() => {});
  }, [reloadKey]);

  const thisWeek = entries.find((e) => e.periodStart === thisMon);
  const nextWeek = entries.find((e) => e.periodStart === nextMon);

  return (
    <div className="card no-print overview">
      <h2>근무 계획 현황</h2>
      <div className="week-grid">
        <WeekCard title="이번 주" monday={thisMon} entry={thisWeek} />
        <WeekCard title="다음 주" monday={nextMon} entry={nextWeek} />
      </div>
    </div>
  );
}
