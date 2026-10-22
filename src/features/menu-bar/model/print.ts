import { applyDatePart, formatHM, hoursCellText, periodDatePart, permitDatePart, timeCellText, totalCreditMinutes, type Entry } from "@/lib/schedule";

const printCSS = "body { margin: 0; background: white; font-size: 14px; } * { box-sizing: border-box; } /* 원본 docx 모양 재현: 맑은 고딕, 박스 없는 좌측 제목, 균일 굵기 */\n.form-doc {\n  font-family: \"맑은 고딕\", \"Malgun Gothic\", \"Apple SD Gothic Neo\",\n    -apple-system, sans-serif;\n  color: #000;\n}\n.form-title {\n  text-align: center;\n  font-size: 22px;\n  font-weight: 700;\n  margin: 0 0 12px;\n  letter-spacing: -0.5px;\n}\n.form-table {\n  width: 100%;\n  border-collapse: collapse;\n  table-layout: fixed;\n  font-size: 14px;\n}\n.form-table td {\n  border: 1px solid #000;\n  padding: 7px 6px;\n  text-align: center;\n  vertical-align: middle;\n  font-weight: 400;\n  line-height: 1.5;\n  word-break: keep-all;\n  height: 34px;\n}\n.form-table td.period {\n  white-space: nowrap;\n}\n.form-table td.sign-apply {\n  height: 120px;\n  line-height: 2.1;\n}\n.form-table td.sign-permit {\n  height: 150px;\n  vertical-align: top;\n  text-align: left;\n  padding: 12px 10px;\n}\n.sign-permit .permit-left {\n  text-align: left;\n  margin-bottom: 26px;\n}\n.sign-permit .permit-center {\n  text-align: center;\n  margin-bottom: 18px;\n}\n\n @page { size: A4; margin: 18mm 16mm; }";

const escapeHTML = (value: string) => value.replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]!));

// Print-only markup; all values and calculations use the same schedule module as the web.
export function printHTML(entry: Omit<Entry, "id" | "createdAt">, css: string = printCSS) {
  const text = escapeHTML;
  const settings = entry.settings;
  const total = text(formatHM(totalCreditMinutes(entry.days)));
  const columns = [2795, 1701, 1500, 1169, 734, 1984];
  const width = columns.reduce((sum, value) => sum + value, 0);
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><style>${css}</style>
<body><div class="form-doc"><div class="form-title">유연근무제 신청(변경)서</div>
<table class="form-table"><colgroup>${columns.map(value => `<col style="width:${value / width * 100}%">`).join("")}</colgroup><tbody>
<tr><td>병역지정업체명</td><td colspan="2">${text(settings.company)}</td><td>부서<br>(업무)</td><td colspan="2">${text(settings.department)}</td></tr>
<tr><td>생년월일</td><td colspan="5">${text(settings.birth)}</td></tr>
<tr><td>성 명</td><td colspan="5">${text(settings.name)}</td></tr>
<tr><td>유연근무 신청기간</td><td colspan="4">근무요일별 근로시간 선택</td><td>시간</td></tr>
${entry.days.map((day, index) => `<tr>${index === 0 ? `<td rowspan="6" class="period">${text(periodDatePart(entry.periodStart))}<br>~<br>${text(periodDatePart(entry.periodEnd))}</td>` : ""}<td>${text(day.weekday)}</td><td colspan="3">${text(timeCellText(day))}</td><td>${text(hoursCellText(day))}</td></tr>`).join("")}
<tr><td>계</td><td colspan="3">${total}</td><td>${total}</td></tr>
<tr><td>공동근무시간</td><td colspan="5">${text(settings.coreTime)}</td></tr>
<tr><td class="sign-apply" colspan="6">위와 같이 유연근무제를 신청(변경)합니다.<br>${text(applyDatePart(entry.applyDate))}<br>${text(settings.name)} (인) 또는 서명</td></tr>
<tr><td class="sign-permit" colspan="6"><div class="permit-left">위 신청(변경)을 허가함</div><div class="permit-center" style="white-space:pre">${text(permitDatePart(entry.applyDate))}</div><div class="permit-center">${text(settings.company)} 대표의(인)</div></td></tr>
</tbody></table></div></body></html>`;
}
