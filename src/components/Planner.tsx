"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import FormView from "./FormView";
import WeekOverview from "./WeekOverview";
import { apiFetch } from "@/lib/api";
import {
  type DayEntry,
  type DayMode,
  type Entry,
  type Settings,
  AM_HALF_START,
  DAY_MODE_LABEL,
  END_OPTIONS,
  PM_HALF_END,
  START_OPTIONS,
  WEEKDAY_LABELS,
  addDays,
  buildDefaultDays,
  formatHM,
  hoursCellText,
  nextMonday,
  shortDate,
  thisMonday,
  toMinutes,
  totalCreditMinutes,
  WEEKLY_TARGET_MIN,
} from "@/lib/schedule";

function fromMinutes(min: number): string {
  const m = Math.max(0, Math.min(24 * 60, min));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

// 모드 전환 시 기본 시간
function defaultTimes(
  mode: DayMode,
  prev: DayEntry
): { start: string; end: string } {
  switch (mode) {
    case "work":
      return {
        start: START_OPTIONS.includes(prev.start) ? prev.start : "09:00",
        end: END_OPTIONS.includes(prev.end) ? prev.end : "18:00",
      };
    case "leave_pm": // 오전 근무 + 퇴근 13:00 고정
      return {
        start: START_OPTIONS.includes(prev.start) ? prev.start : "09:00",
        end: PM_HALF_END,
      };
    case "leave_am": // 출근 14:00 고정 + 오후 근무
      return {
        start: AM_HALF_START,
        end: END_OPTIONS.includes(prev.end) ? prev.end : "18:00",
      };
    default:
      return { start: prev.start, end: prev.end };
  }
}

const MODE_OPTIONS: DayMode[] = [
  "work",
  "holiday",
  "leave_full",
  "leave_pm",
  "leave_am",
];

export default function Planner({
  initialSettings,
}: {
  initialSettings: Settings;
}) {
  const start0 = nextMonday();
  const [settings, setSettings] = useState<Settings>(initialSettings);
  // 기본 정보에 빈 칸이 있으면(새 사용자) 처음부터 펼쳐 둠
  const [showSettings, setShowSettings] = useState(() =>
    Object.values(initialSettings).some((v) => !v.trim())
  );
  const [week, setWeek] = useState<"this" | "next">("next");
  const [periodStart, setPeriodStart] = useState(start0);
  const [periodEnd, setPeriodEnd] = useState(addDays(start0, 4));
  const [applyDate, setApplyDate] = useState(addDays(start0, -3));
  const [days, setDays] = useState<DayEntry[]>(buildDefaultDays(start0));
  const [loadedFromSaved, setLoadedFromSaved] = useState(false);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [entries, setEntries] = useState<Entry[]>([]);
  const inited = useRef(false);

  const total = useMemo(() => totalCreditMinutes(days), [days]);
  const diff = total - WEEKLY_TARGET_MIN;

  // 저장된 기록 로드 (최초 1회 다음주 자동 선택)
  useEffect(() => {
    apiFetch("/api/entries")
      .then((r) => r.json())
      .then((list: Entry[]) => {
        setEntries(list);
        if (!inited.current) {
          inited.current = true;
          applyWeek("next", list);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  function flash(kind: "ok" | "err", msg: string) {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 4000);
  }

  // 주 선택: 저장본 있으면 불러오고, 없으면 기본 일정
  function applyWeek(w: "this" | "next", list: Entry[]) {
    const monday = w === "this" ? thisMonday() : nextMonday();
    const saved = list.find((e) => e.periodStart === monday);
    setWeek(w);
    setPeriodStart(monday);
    setPeriodEnd(addDays(monday, 4));
    if (saved) {
      setApplyDate(saved.applyDate);
      setDays(
        saved.days.map((d, i) => ({
          ...d,
          date: addDays(monday, i),
          weekday: WEEKDAY_LABELS[i],
          // 공휴일이 아닌 날의 잔여 문구 제거
          holidayText: d.mode === "holiday" ? d.holidayText || "공휴일" : "",
        }))
      );
      setSettings(saved.settings);
      setLoadedFromSaved(true);
    } else {
      setApplyDate(addDays(monday, -3));
      setDays(buildDefaultDays(monday));
      setLoadedFromSaved(false);
    }
  }

  function setDay(i: number, patch: Partial<DayEntry>) {
    setDays((ds) => ds.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }

  function onModeChange(i: number, mode: DayMode) {
    setDays((ds) =>
      ds.map((d, idx) => {
        if (idx !== i) return d;
        const next = { ...d, mode, ...defaultTimes(mode, d) };
        // 공휴일 선택 시 기본 문구는 항상 "공휴일", 그 외 모드는 비움(잔여 문구 제거)
        next.holidayText = mode === "holiday" ? "공휴일" : "";
        return next;
      })
    );
  }

  // 잔여 시간을 마지막 근무일 종료시각으로 자동 배분 (주 40시간 맞춤)
  function balanceToTarget() {
    const idx = days.map((d) => d.mode).lastIndexOf("work");
    if (idx < 0) {
      flash("err", "근무일이 없어 자동 배분할 수 없습니다.");
      return;
    }
    const day = days[idx];
    const need = WEEKLY_TARGET_MIN - total;
    let newEnd = toMinutes(day.end) + need;
    // 10분 단위로 반올림 + 17:00~19:00 범위로 제한
    newEnd = Math.round(newEnd / 10) * 10;
    const lo = toMinutes("17:00");
    const hi = toMinutes("19:00");
    if (newEnd < lo || newEnd > hi) {
      flash("err", "한 근무일(17:00~19:00)로는 맞출 수 없습니다. 다른 날을 조정하세요.");
      return;
    }
    setDay(idx, { end: fromMinutes(newEnd) });
    flash("ok", `${day.weekday} 퇴근시각을 ${fromMinutes(newEnd)}로 조정했습니다.`);
  }

  function buildBody() {
    return { periodStart, periodEnd, applyDate, days, settings };
  }

  async function handleSave() {
    setBusy(true);
    try {
      const res = await apiFetch("/api/entries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildBody()),
      });
      if (!res.ok) throw new Error(await res.text());
      flash("ok", "제출 기록에 저장되었습니다.");
      setLoadedFromSaved(true);
      setReloadKey((k) => k + 1); // 상단 주간 현황 갱신
    } catch (e) {
      flash("err", "저장 실패: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDownload() {
    setBusy(true);
    try {
      const res = await apiFetch("/api/docx", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildBody()),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const d = new Date(periodStart + "T00:00:00");
      a.download = `${String(d.getMonth() + 1).padStart(2, "0")}${String(
        d.getDate()
      ).padStart(2, "0")}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      flash("err", "다운로드 실패: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function renderTimeCell(d: DayEntry, i: number) {
    const startSelect = (
      <select value={d.start} onChange={(e) => setDay(i, { start: e.target.value })}>
        {START_OPTIONS.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    );
    const endSelect = (
      <select value={d.end} onChange={(e) => setDay(i, { end: e.target.value })}>
        {END_OPTIONS.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    );

    switch (d.mode) {
      case "work":
        return (
          <div className="timeinputs">
            {startSelect}
            <span>~</span>
            {endSelect}
          </div>
        );
      case "leave_pm":
        return (
          <div className="timeinputs">
            {startSelect}
            <span>~</span>
            <span className="fixed-time">{PM_HALF_END}</span>
            <span className="muted">오후 반차 (퇴근 고정)</span>
          </div>
        );
      case "leave_am":
        return (
          <div className="timeinputs">
            <span className="fixed-time">{AM_HALF_START}</span>
            <span>~</span>
            {endSelect}
            <span className="muted">오전 반차 (출근 고정)</span>
          </div>
        );
      case "holiday":
        return (
          <div className="timeinputs">
            <input
              type="text"
              value={d.holidayText ?? ""}
              placeholder="공휴일"
              onChange={(e) => setDay(i, { holidayText: e.target.value })}
              style={{ width: 200 }}
            />
            <span className="muted">8시간 인정</span>
          </div>
        );
      case "leave_full":
        return <span className="muted">휴가 (8시간 인정)</span>;
    }
  }

  return (
    <>
      {/* 상단: 이번주 / 다음주 근무 현황 */}
      <WeekOverview reloadKey={reloadKey} />

      {/* 기본 정보 */}
      <div className="card no-print">
        <div className="card-head">
          <h2>기본 정보</h2>
          <button className="ghost" onClick={() => setShowSettings((v) => !v)}>
            {showSettings ? "접기" : "수정"}
          </button>
        </div>
        {showSettings ? (
          <div className="row">
            {(
              [
                ["company", "병역지정업체명"],
                ["department", "부서(업무)"],
                ["birth", "생년월일"],
                ["name", "성 명"],
                ["coreTime", "공동근무시간"],
              ] as [keyof Settings, string][]
            ).map(([key, label]) => (
              <div className="field" key={key} style={{ flex: "1 1 180px" }}>
                <label>{label}</label>
                <input
                  value={settings[key]}
                  onChange={(e) =>
                    setSettings({ ...settings, [key]: e.target.value })
                  }
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="muted">
            {settings.company} · {settings.department} · {settings.name} (
            {settings.birth}) · 공동근무 {settings.coreTime}
          </div>
        )}
      </div>

      {/* 신청 기간 */}
      <div className="card no-print">
        <h2>신청 기간</h2>
        <div className="week-toggle">
          {(["this", "next"] as const).map((w) => {
            const monday = w === "this" ? thisMonday() : nextMonday();
            return (
              <button
                key={w}
                type="button"
                className={"week-btn" + (week === w ? " active" : "")}
                onClick={() => applyWeek(w, entries)}
              >
                <span className="week-btn-title">
                  {w === "this" ? "이번 주" : "다음 주"}
                </span>
                <span className="week-btn-range">
                  {shortDate(monday)} ~ {shortDate(addDays(monday, 4))}
                </span>
              </button>
            );
          })}
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          <div className="field" style={{ flex: "1 1 160px" }}>
            <label>신청일</label>
            <input
              type="date"
              value={applyDate}
              onChange={(e) => setApplyDate(e.target.value)}
            />
          </div>
        </div>
        {loadedFromSaved && (
          <div className="hint" style={{ color: "var(--accent)" }}>
            이 주에 저장된 계획을 불러왔습니다. 수정 후 다시 저장하면 갱신됩니다.
          </div>
        )}
      </div>

      {/* 요일별 근무 설정 */}
      <div className="card no-print">
        <div className="card-head">
          <h2>요일별 근무 시간</h2>
          <button onClick={balanceToTarget}>40시간 자동 맞춤</button>
        </div>
        <table className="sched">
          <thead>
            <tr>
              <th style={{ width: 110 }}>요일</th>
              <th style={{ width: 140 }}>구분</th>
              <th>시간 설정</th>
              <th style={{ width: 100 }}>인정 시간</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d, i) => (
              <tr key={i}>
                <td>
                  <div className="weekday">{d.weekday}</div>
                  <div className="date-sub">{shortDate(d.date)}</div>
                </td>
                <td>
                  <select
                    value={d.mode}
                    onChange={(e) => onModeChange(i, e.target.value as DayMode)}
                  >
                    {MODE_OPTIONS.map((m) => (
                      <option key={m} value={m}>
                        {DAY_MODE_LABEL[m]}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{renderTimeCell(d, i)}</td>
                <td className="hours">{hoursCellText(d)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className={"total-bar " + (diff === 0 ? "ok" : "warn")}>
          <span>주간 합계 (계)</span>
          <span>
            {formatHM(total)} / 40시간{" "}
            {diff === 0
              ? "✓ 정확합니다"
              : diff > 0
              ? `(+${formatHM(diff)} 초과)`
              : `(-${formatHM(-diff)} 부족)`}
          </span>
        </div>

        <div className="actions">
          <button className="primary" onClick={handleSave} disabled={busy}>
            저장 (기록)
          </button>
          <button onClick={() => window.print()} disabled={busy}>
            인쇄
          </button>
          <button onClick={handleDownload} disabled={busy}>
            Word(docx) 다운로드
          </button>
        </div>
        {toast && <div className={"toast " + toast.kind}>{toast.msg}</div>}
        <div className="hint">
          인쇄는 브라우저 인쇄창에서 컴퓨터에 등록된 프린터를 선택해 바로 출력됩니다.
        </div>
      </div>

      {/* 미리보기 (화면) */}
      <div className="card no-print">
        <h2>미리보기</h2>
        <FormView
          className="print-preview"
          settings={settings}
          periodStart={periodStart}
          periodEnd={periodEnd}
          applyDate={applyDate}
          days={days}
        />
      </div>

      {/* 인쇄 전용 영역 */}
      <FormView
        className="print-area"
        settings={settings}
        periodStart={periodStart}
        periodEnd={periodEnd}
        applyDate={applyDate}
        days={days}
      />
    </>
  );
}
