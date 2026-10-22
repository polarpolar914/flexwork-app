import {
  addDays, buildDefaultDays, END_OPTIONS, nextMonday, START_OPTIONS, thisMonday,
  balanceToTarget, changeMode, DAY_MODE_LABEL, fillFromHiworks, parseWorkCalendar,
  type DayEntry, type DayMode, type Entry, type Settings,
} from "@/lib/schedule";

export function weekPlan(week: "this" | "next", entries: Entry[], settings: Settings) {
  const periodStart = week === "this" ? thisMonday() : nextMonday();
  const saved = entries.find((entry) => entry.periodStart === periodStart);
  return {
    periodStart, periodEnd: addDays(periodStart, 4),
    applyDate: saved?.applyDate ?? addDays(periodStart, -3),
    days: saved?.days ?? buildDefaultDays(periodStart), settings: saved?.settings ?? settings,
    saved: Boolean(saved), startOptions: START_OPTIONS, endOptions: END_OPTIONS,
  };
}



export function validDays(value: unknown): value is DayEntry[] {
  return Array.isArray(value) && value.length === 5 && value.every((day) =>
    day && typeof day === "object" &&
    typeof day.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day.date) &&
    typeof day.weekday === "string" && Object.prototype.hasOwnProperty.call(DAY_MODE_LABEL, day.mode) &&
    (START_OPTIONS.includes(day.start) || day.start === "14:00") &&
    (END_OPTIONS.includes(day.end) || day.end === "13:00") &&
    (day.holidayText === undefined || typeof day.holidayText === "string")
  );
}

export function transformDays(input: unknown): DayEntry[] {
  const body = input as Record<string, unknown> | null;
  if (!body || !validDays(body.days)) throw new Error("월~금 일정이 필요합니다.");
  const days = body.days;
  if (body.action === "balance") {
    const result = balanceToTarget(days);
    if (!result.ok) throw new Error(result.error);
    return result.days;
  }
  if (body.action === "mode" && Number.isInteger(body.index) &&
      Number(body.index) >= 0 && Number(body.index) < 5 &&
      typeof body.mode === "string" && Object.prototype.hasOwnProperty.call(DAY_MODE_LABEL, body.mode)) {
    return days.map((day, index) => index === body.index ? changeMode(day, body.mode as DayMode) : day);
  }
  if (body.action === "hiworks") {
    if (!Array.isArray((body.calendar as { data?: { user_work_data?: unknown } })?.data?.user_work_data)) {
      throw new Error("Hiworks 근태 응답을 확인할 수 없습니다.");
    }
    return fillFromHiworks(days, parseWorkCalendar(body.calendar));
  }
  throw new Error("지원하지 않는 일정 작업입니다.");
}
