import { printHTML } from "../src/features/menu-bar/model/print";
import assert from "node:assert/strict";
import { transformDays, weekPlan } from "../src/features/menu-bar/model/plan";
import { buildDefaultDays, DEFAULT_SETTINGS, nextMonday, totalCreditMinutes } from "../src/lib/schedule";
import {
  applyTemplate, cleanTemplateName, lastUsedTemplate, templateDaysFrom, validTemplateDays,
} from "../src/features/menu-bar/model/template";

const days = buildDefaultDays("2026-10-26");
const half = transformDays({ action: "mode", days, index: 0, mode: "leave_am" });
assert.equal(half[0].start, "14:00");
assert.equal(days[0].start, "09:00");
const balanced = transformDays({ action: "balance", days: days.map((day, index) => index === 4 ? { ...day, end: "17:00" } : day) });
assert.equal(totalCreditMinutes(balanced), 2400);
assert.throws(() => transformDays({ action: "balance", days: [] }));
assert.throws(() => transformDays({ action: "mode", days, index: 9, mode: "work" }));
assert.throws(() => transformDays({ action: "hiworks", days, calendar: {} }));
assert.throws(() => transformDays({ action: "balance", days: days.map(day => ({ ...day, mode: "leave_full" })) }));
const plan = weekPlan("next", [], DEFAULT_SETTINGS);
assert.equal(plan.periodStart, nextMonday());
assert.equal(plan.saved, false);
assert.equal(totalCreditMinutes(plan.days), 2400);
const saved = weekPlan("next", [{ ...plan, id: "test", createdAt: "test", applyDate: "2026-10-22" }], DEFAULT_SETTINGS);
assert.equal(saved.saved, true);
assert.equal(saved.applyDate, "2026-10-22");

const html = printHTML({ ...plan, settings: { ...plan.settings, name: '<script>alert("x")</script>' } });
assert.ok(html.includes("&lt;script&gt;"));
assert.ok(!html.includes('<script>'));
assert.ok(html.includes("유연근무제 신청(변경)서"));
assert.ok(html.includes("size: A4"));
console.log("Menu bar scheduling and print checks passed");

// 출근 스냅은 올림 — 09:04 출근을 09:00으로 내려 적으면 일하지 않은 4분이 근무가 된다.
const punched = transformDays({
  action: "hiworks",
  days: buildDefaultDays("2026-10-19"),
  calendar: {
    data: {
      user_work_data: [
        { work_date: "2026-10-19", start_at: "2026-10-19 09:31:00", end_at: "2026-10-19 17:01:00" },
        { work_date: "2026-10-21", start_at: "2026-10-21 09:04:00", end_at: "2026-10-21 19:00:00" },
        { work_date: "2026-10-23", start_at: "2026-10-23 08:57:00", end_at: "2026-10-23 19:00:00" },
      ],
    },
  },
});
assert.equal(punched[0].start, "09:40"); // 09:31 → 올림
assert.equal(punched[2].start, "09:10"); // 09:04 → 올림 (반올림이면 09:00)
assert.equal(punched[4].start, "09:00"); // 08:57 → 올림 09:00, 하한과 동일
console.log("Clock-in rounding checks passed");

// ---- 주간 패턴 템플릿 ----
// 템플릿은 Hiworks 실적을 가져올 수 없는 미래 주의 출발점이다.
const myPattern = {
  id: "t1",
  name: "평소",
  days: [
    { start: "09:00", end: "19:00" },
    { start: "09:00", end: "19:00" },
    { start: "09:00", end: "18:00" },
    { start: "09:00", end: "17:00" },
    { start: "09:00", end: "17:00" },
  ],
};
assert.ok(validTemplateDays(myPattern.days));
assert.equal(totalCreditMinutes(applyTemplate("2026-11-02", myPattern)), 2400);

// 마지막에 고른 템플릿이 저장본 없는 주의 기본값이 된다.
const withTemplate = weekPlan("next", [], DEFAULT_SETTINGS, myPattern);
assert.deepEqual(withTemplate.days.map((d) => d.end), ["19:00", "19:00", "18:00", "17:00", "17:00"]);
assert.equal(withTemplate.days[0].date, nextMonday());
// 템플릿이 없으면 앱 기본 일정으로 떨어진다.
assert.deepEqual(weekPlan("next", [], DEFAULT_SETTINGS, null).days.map((d) => d.end),
  buildDefaultDays(nextMonday()).map((d) => d.end));
// 저장본이 있으면 템플릿보다 저장본이 우선이다.
const stored = { ...withTemplate, id: "e1", createdAt: "x", applyDate: "2026-10-30" };
assert.equal(weekPlan("next", [stored], DEFAULT_SETTINGS, myPattern).saved, true);

// 휴가인 날은 시각을 그대로 담지 않는다 (범위 밖 값이 템플릿에 들어가면 안 됨).
const monday = nextMonday();
const withLeave = transformDays({ action: "mode", days: buildDefaultDays(monday), index: 0, mode: "leave_am" });
const extracted = templateDaysFrom(withLeave, monday);
assert.ok(validTemplateDays(extracted));
assert.equal(extracted[0].start, buildDefaultDays(monday)[0].start);
// 근무일은 화면의 시각이 그대로 담긴다.
assert.equal(templateDaysFrom(applyTemplate(monday, myPattern), monday)[2].end, "18:00");

assert.equal(lastUsedTemplate({ items: [myPattern], lastUsedId: "t1" })?.name, "평소");
assert.equal(lastUsedTemplate({ items: [myPattern], lastUsedId: "없음" }), null);
assert.equal(cleanTemplateName("  평소 패턴  "), "평소 패턴");
assert.equal(cleanTemplateName(123), "");
console.log("Template checks passed");
