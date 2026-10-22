import { printHTML } from "../src/features/menu-bar/model/print";
import assert from "node:assert/strict";
import { transformDays, weekPlan } from "../src/features/menu-bar/model/plan";
import { buildDefaultDays, DEFAULT_SETTINGS, nextMonday, totalCreditMinutes } from "../src/lib/schedule";

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
