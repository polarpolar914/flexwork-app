import {
  type DayEntry,
  type Settings,
  WEEKDAY_LABELS,
  applyDatePart,
  formatHM,
  hoursCellText,
  periodDatePart,
  timeCellText,
  totalCreditMinutes,
} from "@/lib/schedule";

interface Props {
  settings: Settings;
  periodStart: string;
  periodEnd: string;
  applyDate: string;
  days: DayEntry[];
  className?: string;
}

// 공식 양식 그대로의 HTML 렌더 (화면 미리보기 + 인쇄 공용)
// 열 너비는 원본 docx grid [2795,1701,1500,1169,734,1984] 비례
const COLS = [2795, 1701, 1500, 1169, 734, 1984];
const TOTAL = COLS.reduce((a, b) => a + b, 0);

export default function FormView({
  settings,
  periodStart,
  periodEnd,
  applyDate,
  days,
  className,
}: Props) {
  const total = formatHM(totalCreditMinutes(days));

  return (
    <div className={"form-doc " + (className ?? "")}>
      <div className="form-title">유연근무제 신청(변경)서</div>
      <table className="form-table">
        <colgroup>
          {COLS.map((w, i) => (
            <col key={i} style={{ width: `${(w / TOTAL) * 100}%` }} />
          ))}
        </colgroup>
        <tbody>
          <tr>
            <td>병역지정업체명</td>
            <td colSpan={2}>{settings.company}</td>
            <td>
              부서
              <br />
              (업무)
            </td>
            <td colSpan={2}>{settings.department}</td>
          </tr>
          <tr>
            <td>생년월일</td>
            <td colSpan={5}>{settings.birth}</td>
          </tr>
          <tr>
            <td>성 명</td>
            <td colSpan={5}>{settings.name}</td>
          </tr>
          <tr>
            <td>유연근무 신청기간</td>
            <td colSpan={4}>근무요일별 근로시간 선택</td>
            <td>시간</td>
          </tr>
          {WEEKDAY_LABELS.map((wd, i) => (
            <tr key={wd}>
              {i === 0 && (
                <td rowSpan={6} className="period">
                  {periodDatePart(periodStart)}
                  <br />~<br />
                  {periodDatePart(periodEnd)}
                </td>
              )}
              <td>{wd}</td>
              <td colSpan={3}>{timeCellText(days[i])}</td>
              <td>{hoursCellText(days[i])}</td>
            </tr>
          ))}
          <tr>
            <td>계</td>
            <td colSpan={3}>{total}</td>
            <td>{total}</td>
          </tr>
          <tr>
            <td>공동근무시간</td>
            <td colSpan={5}>{settings.coreTime}</td>
          </tr>
          <tr>
            <td className="sign-apply" colSpan={6}>
              위와 같이 유연근무제를 신청(변경)합니다.
              <br />
              {applyDatePart(applyDate)}
              <br />
              {settings.name} (인) 또는 서명
            </td>
          </tr>
          <tr>
            <td className="sign-permit" colSpan={6}>
              <div className="permit-left">위 신청(변경)을 허가함</div>
              <div className="permit-center">2026년 월 일</div>
              <div className="permit-center">{settings.company} 대표의(인)</div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
