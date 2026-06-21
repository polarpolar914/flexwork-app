import {
  AlignmentType,
  BorderStyle,
  Document,
  HeightRule,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  VerticalMergeType,
  WidthType,
} from "docx";
import {
  type Entry,
  WEEKDAY_LABELS,
  formatHM,
  hoursCellText,
  periodDatePart,
  applyDatePart,
  timeCellText,
  totalCreditMinutes,
} from "./schedule";

const FONT = "맑은 고딕";
const SIZE = 24; // half-points = 12pt
const COLS = [2795, 1701, 1500, 1169, 734, 1984];
const TABLE_W = COLS.reduce((a, b) => a + b, 0);

const SINGLE = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
const CELL_BORDERS = {
  top: SINGLE,
  bottom: SINGLE,
  left: SINGLE,
  right: SINGLE,
};

type Align = "center" | "left";

function para(line: string, align: Align = "center"): Paragraph {
  return new Paragraph({
    alignment: align === "left" ? AlignmentType.LEFT : AlignmentType.CENTER,
    spacing: { line: 264, before: 0, after: 0 },
    children: [new TextRun({ text: line, font: FONT, size: SIZE })],
  });
}

function lines(text: string, align: Align = "center"): Paragraph[] {
  return text.split("\n").map((l) => para(l, align));
}

interface CellOpts {
  span?: number;
  vmerge?: "restart" | "continue";
  valign?: "center" | "top";
  children?: Paragraph[];
}

function cell(text: string, opts: CellOpts = {}): TableCell {
  return new TableCell({
    columnSpan: opts.span,
    verticalAlign:
      opts.valign === "top" ? VerticalAlign.TOP : VerticalAlign.CENTER,
    borders: CELL_BORDERS,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    verticalMerge:
      opts.vmerge === "restart"
        ? VerticalMergeType.RESTART
        : opts.vmerge === "continue"
        ? VerticalMergeType.CONTINUE
        : undefined,
    children:
      opts.children ??
      (opts.vmerge === "continue" ? [new Paragraph("")] : lines(text)),
  });
}

// 표준 행 높이(원본 비례)
const ROW_DATA = 520;

export async function buildDocx(entry: Entry): Promise<Buffer> {
  const s = entry.settings;
  const totalText = formatHM(totalCreditMinutes(entry.days));

  // 제목: 박스 없이 가운데 굵은 글씨
  const title = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 160 },
    children: [
      new TextRun({ text: "유연근무제 신청(변경)서", font: FONT, size: 40, bold: true }),
    ],
  });

  // 신청기간 셀: 날짜 / ~ / 날짜 3줄
  const periodChildren = [
    para(periodDatePart(entry.periodStart)),
    para("~"),
    para(periodDatePart(entry.periodEnd)),
  ];

  const weekdayRows = WEEKDAY_LABELS.map((wd, i) => {
    const day = entry.days[i];
    const periodCell =
      i === 0
        ? cell("", { vmerge: "restart", children: periodChildren })
        : cell("", { vmerge: "continue" });
    return new TableRow({
      height: { value: ROW_DATA, rule: HeightRule.ATLEAST },
      children: [
        periodCell,
        cell(wd),
        cell(timeCellText(day), { span: 3 }),
        cell(hoursCellText(day)),
      ],
    });
  });

  const totalRow = new TableRow({
    height: { value: ROW_DATA, rule: HeightRule.ATLEAST },
    children: [
      cell("", { vmerge: "continue" }),
      cell("계"),
      cell(totalText, { span: 3 }),
      cell(totalText),
    ],
  });

  const applyCell = cell("", {
    span: 6,
    valign: "center",
    children: [
      para("위와 같이 유연근무제를 신청(변경)합니다."),
      para(applyDatePart(entry.applyDate)),
      para(`${s.name} (인) 또는 서명`),
    ],
  });

  const permitCell = cell("", {
    span: 6,
    valign: "top",
    children: [
      para("위 신청(변경)을 허가함", "left"),
      para(""),
      para("2026년    월     일"),
      para(""),
      para(`${s.company} 대표의(인)`),
    ],
  });

  const mainTable = new Table({
    width: { size: TABLE_W, type: WidthType.DXA },
    columnWidths: COLS,
    rows: [
      new TableRow({
        height: { value: ROW_DATA, rule: HeightRule.ATLEAST },
        children: [
          cell("병역지정업체명"),
          cell(s.company, { span: 2 }),
          cell("", { children: lines("부서\n(업무)") }),
          cell(s.department, { span: 2 }),
        ],
      }),
      new TableRow({
        height: { value: ROW_DATA, rule: HeightRule.ATLEAST },
        children: [cell("생년월일"), cell(s.birth, { span: 5 })],
      }),
      new TableRow({
        height: { value: ROW_DATA, rule: HeightRule.ATLEAST },
        children: [cell("성 명"), cell(s.name, { span: 5 })],
      }),
      new TableRow({
        height: { value: ROW_DATA, rule: HeightRule.ATLEAST },
        children: [
          cell("유연근무 신청기간"),
          cell("근무요일별 근로시간 선택", { span: 4 }),
          cell("시간"),
        ],
      }),
      ...weekdayRows,
      totalRow,
      new TableRow({
        height: { value: ROW_DATA, rule: HeightRule.ATLEAST },
        children: [cell("공동근무시간"), cell(s.coreTime, { span: 5 })],
      }),
      new TableRow({
        height: { value: 1600, rule: HeightRule.ATLEAST },
        children: [applyCell],
      }),
      new TableRow({
        height: { value: 1900, rule: HeightRule.ATLEAST },
        children: [permitCell],
      }),
    ],
  });

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1417, right: 1133, bottom: 1417, left: 1133 },
          },
        },
        children: [title, mainTable],
      },
    ],
  });

  return Packer.toBuffer(doc);
}

// 다운로드 파일명: MMDD.docx (월요일 기준, 원본 명명 관행)
export function docxFilename(entry: Entry): string {
  const d = new Date(entry.periodStart + "T00:00:00");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}${dd}.docx`;
}
