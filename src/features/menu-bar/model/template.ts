import {
  buildDefaultDays, END_OPTIONS, START_OPTIONS, WEEKDAY_LABELS,
  type DayEntry,
} from "@/lib/schedule";

// 자주 쓰는 주간 근무 패턴. 다음 주처럼 Hiworks에서 가져올 실적이 없는 주의
// 출발점으로 쓴다. 요일별 출퇴근 시각만 담고, 휴가·공휴일 구분은 담지 않는다
// (지난주 휴가가 다음 주에 딸려오면 틀린 신청서가 된다).
export interface TemplateDay {
  start: string;
  end: string;
}

export interface Template {
  id: string;
  name: string;
  days: TemplateDay[]; // 월~금 5개
}

// 저장 파일 구조. lastUsedId는 "다음에 열었을 때 기본으로 깔릴 템플릿".
export interface TemplateStore {
  items: Template[];
  lastUsedId: string | null;
}

export const EMPTY_TEMPLATES: TemplateStore = { items: [], lastUsedId: null };

export const TEMPLATE_NAME_MAX = 20;

export function validTemplateDays(value: unknown): value is TemplateDay[] {
  return Array.isArray(value) && value.length === WEEKDAY_LABELS.length &&
    value.every((day) =>
      day && typeof day === "object" &&
      typeof day.start === "string" && START_OPTIONS.includes(day.start) &&
      typeof day.end === "string" && END_OPTIONS.includes(day.end));
}

export function cleanTemplateName(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, TEMPLATE_NAME_MAX) : "";
}

// 현재 화면의 일정에서 템플릿으로 저장할 부분만 뽑는다. 근무가 아닌 날
// (휴가·공휴일)은 시각을 그대로 담으면 범위 밖 값이 들어가므로 기본값으로 둔다.
export function templateDaysFrom(days: DayEntry[], periodStart: string): TemplateDay[] {
  const fallback = buildDefaultDays(periodStart);
  return days.map((day, index) =>
    day.mode === "work"
      ? { start: day.start, end: day.end }
      : { start: fallback[index].start, end: fallback[index].end });
}

// 템플릿을 한 주에 적용한다. 날짜·요일은 그 주의 것으로 새로 만들고,
// 모든 날을 근무로 둔다.
export function applyTemplate(periodStart: string, template: Template | null): DayEntry[] {
  const days = buildDefaultDays(periodStart);
  if (!template || !validTemplateDays(template.days)) return days;
  return days.map((day, index) => ({
    ...day,
    start: template.days[index].start,
    end: template.days[index].end,
  }));
}

export function lastUsedTemplate(store: TemplateStore): Template | null {
  return store.items.find((item) => item.id === store.lastUsedId) ?? null;
}
