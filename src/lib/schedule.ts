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

export const DEFAULT_SETTINGS: Settings = {
  company: "전능아이티㈜",
  department: "개발2팀",
  birth: "03.09.14",
  name: "김동우",
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
      return `${day.start} ~${day.end}`;
    case "holiday":
      return day.holidayText && day.holidayText.trim()
        ? day.holidayText.trim()
        : "공휴일";
    case "leave_full":
      return "휴가";
    case "leave_pm":
      return `${day.start} ~${day.end}, 오후 반차`;
    case "leave_am":
      return `${day.start} ~${day.end}, 오전 반차`;
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
