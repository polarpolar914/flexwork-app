// 유연근무제 신청서 공용 로직 (서버/클라이언트 공유)

export type DayMode =
  | "work" // 근무
  | "holiday" // 공휴일
  | "leave_full" // 연차(종일) -> "휴가"
  | "leave_pm" // 연차(오후) -> 오전 근무 + "오후 반차"
  | "leave_am"; // 연차(오전) -> 오후 근무 + "오전 반차"

export const DAY_MODE_LABEL: Record<DayMode, string> = {
  work: "근무",
  holiday: "공휴일",
  leave_full: "연차(종일)",
  leave_pm: "연차(오후)",
  leave_am: "연차(오전)",
};

export const WEEKDAY_LABELS = ["월요일", "화요일", "수요일", "목요일", "금요일"];

export interface DayEntry {
  date: string; // ISO yyyy-mm-dd
  weekday: string; // 월요일..금요일
  mode: DayMode;
  start: string; // "HH:MM"
  end: string; // "HH:MM"
  holidayText?: string; // 공휴일일 때 "공휴일" 대신 표시할 문구(예: 현충일)
}

// 반차 고정 시각
export const PM_HALF_END = "13:00"; // 오후 반차: 오전만 근무 → 퇴근 13:00 고정
export const AM_HALF_START = "14:00"; // 오전 반차: 오후만 근무 → 출근 14:00 고정

// 선택 가능한 시각 옵션 (10분 단위)
export function genTimes(startHM: string, endHM: string, stepMin: number): string[] {
  const out: string[] = [];
  let t = toMinutes(startHM);
  const end = toMinutes(endHM);
  for (; t <= end; t += stepMin) {
    const h = Math.floor(t / 60);
    const m = t % 60;
    out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }
  return out;
}

export interface Settings {
  company: string; // 병역지정업체명
  department: string; // 부서(업무)
  birth: string; // 생년월일
  name: string; // 성 명
  coreTime: string; // 공동근무시간
}

export interface Entry {
  id: string;
  createdAt: string; // ISO datetime
  periodStart: string; // ISO yyyy-mm-dd (월)
  periodEnd: string; // ISO yyyy-mm-dd (금)
  applyDate: string; // ISO yyyy-mm-dd (신청일)
  days: DayEntry[];
  settings: Settings;
}

// 새 사용자 기본값: 회사·공동근무시간만 채우고 개인 정보는 각자 입력
export const DEFAULT_SETTINGS: Settings = {
  company: "전능아이티㈜",
  department: "",
  birth: "",
  name: "",
  coreTime: "10시 ～ 17시(6시간)",
};

export const WEEKLY_TARGET_MIN = 40 * 60; // 40시간
const LUNCH_MIN = 60;
const LEAVE_CREDIT_MIN = 8 * 60; // 공휴일/연차 1일 인정 8시간

export function toMinutes(hm: string): number {
  const [h, m] = hm.split(":").map((n) => parseInt(n, 10));
  return (h || 0) * 60 + (m || 0);
}

// 근무일 실근로(점심 1시간 제외). 종일근무 기준.
export function workedMinutes(day: DayEntry): number {
  const span = toMinutes(day.end) - toMinutes(day.start);
  if (span <= 0) return 0;
  return Math.max(0, span - LUNCH_MIN);
}

// 시간 열(주 40시간 합산용)에 들어가는 인정 시간(분)
export function creditMinutes(day: DayEntry): number {
  switch (day.mode) {
    case "work":
      return workedMinutes(day);
    case "holiday":
    case "leave_full":
    case "leave_pm":
    case "leave_am":
      return LEAVE_CREDIT_MIN;
  }
}

export function totalCreditMinutes(days: DayEntry[]): number {
  return days.reduce((s, d) => s + creditMinutes(d), 0);
}

// "N시간" 또는 "N시간 M분"
export function formatHM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

// 시간대 셀 텍스트 (원본 docx 형식과 동일)
export function timeCellText(day: DayEntry): string {
  switch (day.mode) {
    case "work":
      return `${day.start} ~ ${day.end}`;
    case "holiday":
      return day.holidayText && day.holidayText.trim()
        ? day.holidayText.trim()
        : "공휴일";
    case "leave_full":
      return "휴가";
    case "leave_pm":
      return `${day.start} ~ ${day.end}, 오후 반차`;
    case "leave_am":
      return `${day.start} ~ ${day.end}, 오전 반차`;
  }
}

// 시간 열 텍스트
export function hoursCellText(day: DayEntry): string {
  return formatHM(creditMinutes(day));
}

// ---- 날짜 유틸 ----

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

// 이번 주 월요일
export function thisMonday(today = new Date()): string {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dow = d.getDay(); // 0=일 .. 6=토
  const delta = (dow + 6) % 7; // 월요일까지 거슬러 갈 일수 (일요일=6)
  d.setDate(d.getDate() - delta);
  return isoDate(d);
}

// 기준일(today) 이후 가장 가까운 다음주 월요일
export function nextMonday(today = new Date()): string {
  return addDays(thisMonday(today), 7);
}

// 한국어 날짜 포맷 (원본 docx 간격 재현)
// 신청기간: "2026년    6월  17일" (년 뒤 공백4, 월 뒤 공백2)
export function periodDatePart(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return `${d.getFullYear()}년    ${d.getMonth() + 1}월  ${d.getDate()}일`;
}

// 신청일: "2026년   6월  12일" (년 뒤 공백3, 월 뒤 공백2)
export function applyDatePart(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return `${d.getFullYear()}년   ${d.getMonth() + 1}월  ${d.getDate()}일`;
}

export function periodText(start: string, end: string): string {
  return `${periodDatePart(start)}~${periodDatePart(end)}`;
}

// 사람이 읽기 좋은 짧은 포맷: "6/22(월)"
const KO_DOW = ["일", "월", "화", "수", "목", "금", "토"];
export function shortDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}(${KO_DOW[d.getDay()]})`;
}

// 선택 옵션
export const START_OPTIONS = genTimes("09:00", "10:00", 10); // 출근 09:00~10:00
export const END_OPTIONS = genTimes("17:00", "19:00", 10); // 퇴근 17:00~19:00

// 기본 퇴근시각 (월화수목금) = 19:00, 19:00, 17:20, 17:20, 17:20 -> 합 40시간
const DEFAULT_ENDS = ["19:00", "19:00", "17:20", "17:20", "17:20"];

// 다음주 월~금 기본 일정 생성
export function buildDefaultDays(periodStart: string): DayEntry[] {
  return WEEKDAY_LABELS.map((weekday, i) => ({
    date: addDays(periodStart, i),
    weekday,
    mode: "work" as DayMode,
    start: "09:00",
    end: DEFAULT_ENDS[i],
    holidayText: "",
  }));
}

// 모드 전환 시 기본 시간
export function defaultTimes(
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

// 모드 변경 적용. 공휴일 기본 문구는 "공휴일", 그 외 모드는 문구 비움(잔여 문구 제거)
export function changeMode(day: DayEntry, mode: DayMode): DayEntry {
  return {
    ...day,
    mode,
    ...defaultTimes(mode, day),
    holidayText: mode === "holiday" ? "공휴일" : "",
  };
}

// 잔여 시간을 마지막 근무일 종료시각으로 자동 배분 (주 40시간 맞춤)
export type BalanceResult =
  | { ok: true; index: number; end: string; days: DayEntry[] }
  | { ok: false; error: string };

export function balanceToTarget(days: DayEntry[]): BalanceResult {
  const idx = days.map((d) => d.mode).lastIndexOf("work");
  if (idx < 0) return { ok: false, error: "근무일이 없어 자동 배분할 수 없습니다." };
  const need = WEEKLY_TARGET_MIN - totalCreditMinutes(days);
  // 10분 단위로 반올림 + 17:00~19:00 범위로 제한
  const newEnd = Math.round((toMinutes(days[idx].end) + need) / 10) * 10;
  if (newEnd < toMinutes("17:00") || newEnd > toMinutes("19:00")) {
    return {
      ok: false,
      error: "한 근무일(17:00~19:00)로는 맞출 수 없습니다. 다른 날을 조정하세요.",
    };
  }
  const end = hmFromMinutes(newEnd);
  return {
    ok: true,
    index: idx,
    end,
    days: days.map((d, i) => (i === idx ? { ...d, end } : d)),
  };
}

// ---- Hiworks 근태 → 요일별 시간 자동 반영 ----

// Hiworks 응답 1일치(파싱 결과). start/end는 "HH:MM" 또는 미기록 시 null.
export interface WorkDay {
  date: string; // yyyy-mm-dd
  start: string | null;
  end: string | null;
}

export function hmFromMinutes(min: number): string {
  const m = Math.max(0, Math.min(24 * 60, Math.round(min)));
  const h = Math.floor(m / 60);
  return `${String(h).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

// Hiworks my-work-data-calendar 응답 → 일자별 출퇴근.
// 응답 구조: data.user_work_data[] = { work_date, start_at, end_at, start_status, end_status, ... }
// start_at/end_at는 "yyyy-mm-dd HH:MM:SS" datetime → 첫 HH:MM만 취한다.
// status===2 는 "미체크"(실제로 안 찍힘, 시스템 기본값) → 미기록으로 취급(null).
export function parseWorkCalendar(json: unknown): WorkDay[] {
  const data = (json as { data?: { user_work_data?: unknown } })?.data;
  const rows = Array.isArray(data?.user_work_data) ? data!.user_work_data : [];
  const UNCHECKED = 2; // 미체크
  const hhmm = (v: unknown, status: unknown): string | null => {
    if (status === UNCHECKED) return null; // 미체크 → 미기록
    if (typeof v !== "string") return null;
    const m = v.match(/(\d{1,2}):(\d{2})/);
    if (!m) return null;
    const h = Math.min(23, parseInt(m[1], 10));
    const mm = Math.min(59, parseInt(m[2], 10));
    return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  };
  return rows
    .map((r) => {
      const o = (r ?? {}) as Record<string, unknown>;
      return {
        date: String(o.work_date ?? ""),
        start: hhmm(o.start_at, o.start_status),
        end: hhmm(o.end_at, o.end_status),
      };
    })
    .filter((r) => r.date);
}

// 출근 유효범위 09:00~10:00, 퇴근 17:00~19:00 (10분 단위)
const START_MIN = toMinutes("09:00");
const START_MAX = toMinutes("10:00");
const END_MIN = toMinutes("17:00");
const END_MAX = toMinutes("19:00");

// 10분 단위로 스냅 후 [lo,hi] 범위 안이면 그 값, 밖이면 null(=버림)
function validSnap(hm: string | null, lo: number, hi: number): string | null {
  if (!hm) return null;
  const m = Math.round(toMinutes(hm) / 10) * 10;
  if (m < lo || m > hi) return null;
  return hmFromMinutes(m);
}

// 10분 단위 스냅 후 [lo,hi]로 클램프(범위 밖이어도 버리지 않고 경계값). 미기록만 null.
function clampSnap(hm: string | null, lo: number, hi: number): string | null {
  if (!hm) return null;
  const m = Math.round(toMinutes(hm) / 10) * 10;
  return hmFromMinutes(Math.max(lo, Math.min(hi, m)));
}

// date의 HH:MM 시각이 now 기준으로 이미 지났는지 (로컬 시간대)
function hasPassed(date: string, hm: string, now: Date): boolean {
  return now.getTime() >= new Date(`${date}T${hm}:00`).getTime();
}

// Hiworks 근무데이터로 요일별 시간을 자동 반영.
// - 출근: 기록이 있으면 09:00~10:00(10분)으로 클램프. 미기록이면
//         출근 구간(~10:00)이 아직 안 지났으면 계획값 유지, 지났으면 10:00
// - 퇴근: 기록이 17:00~19:00(10분) 안이면 그 값. 아니면
//         퇴근 구간(~19:00)이 아직 안 지났으면 계획값 유지, 지났으면 17:00
// - 그 주 마지막 근무일 퇴근이 (미기록/범위 밖)이면 → 시점과 무관하게
//   주 40시간을 채우는 10분단위 시각(17:00~19:00)으로
// 근무일(work)만 대상. 공휴일/연차 등 사용자가 지정한 모드는 그대로 둔다.
// days 는 현재 계획(저장된 신청서 또는 기본 일정)이다.
export function fillFromHiworks(
  days: DayEntry[],
  rows: WorkDay[],
  now: Date = new Date()
): DayEntry[] {
  const byDate = new Map(rows.map((r) => [r.date, r]));

  const out: DayEntry[] = days.map((d) => {
    if (d.mode !== "work") return { ...d };
    const row = byDate.get(d.date);
    // 출근: 9시 전이면 9:00, 10시 후면 10:00으로 클램프(버리지 않음).
    const vs = clampSnap(row?.start ?? null, START_MIN, START_MAX);
    // 퇴근: 17~19시 밖이면 버림. 마지막 근무일 미기록은 아래서 40h로 채움.
    const ve = validSnap(row?.end ?? null, END_MIN, END_MAX);
    return {
      ...d,
      start: vs ?? (hasPassed(d.date, "10:00", now) ? "10:00" : d.start),
      end: ve ?? (hasPassed(d.date, "19:00", now) ? "17:00" : d.end),
    };
  });

  // 마지막 근무일 퇴근이 유효하지 않았으면 40시간 맞춤으로 덮어씀
  const last = days.map((d) => d.mode).lastIndexOf("work");
  const lastRow = last >= 0 ? byDate.get(days[last].date) : undefined;
  const lastEndValid = validSnap(lastRow?.end ?? null, END_MIN, END_MAX) != null;
  if (last >= 0 && !lastEndValid) {
    const others = out.reduce(
      (s, d, i) => (i === last ? s : s + creditMinutes(d)),
      0
    );
    const need = WEEKLY_TARGET_MIN - others;
    let end = toMinutes(out[last].start) + LUNCH_MIN + need;
    end = Math.round(end / 10) * 10;
    end = Math.max(END_MIN, Math.min(END_MAX, end));
    out[last] = { ...out[last], end: hmFromMinutes(end) };
  }

  return out;
}
