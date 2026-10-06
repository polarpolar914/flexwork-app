// 유연근무제 신청서 CLI — 웹 UI 없이 src/lib 로직을 그대로 사용한다.
// 앱 로그인(APP_PASSWORD)은 웹 세션용이라 CLI에서는 쓰지 않는다(로컬 파일 직접 접근).
import { promises as fs } from "fs";
import path from "path";
import { createInterface } from "readline/promises";
import { parseArgs } from "util";
import {
  LOCAL_USER,
  type StoredEntry,
  cleanSettings,
  deleteEntry,
  getEntries,
  getSettings,
  newId,
  saveEntry,
  saveSettings,
} from "../lib/db";
import { buildDocx, docxFilename } from "../lib/docxgen";
import { fetchWorkCalendar } from "../lib/hiworks";
import {
  completeOtp,
  getEnvCookie,
  getEnvCreds,
  loginWithCreds,
} from "../lib/hiworks-login";
import {
  DAY_MODE_LABEL,
  DEFAULT_SETTINGS,
  type DayEntry,
  type DayMode,
  type Entry,
  type Settings,
  type WorkDay,
  WEEKDAY_LABELS,
  WEEKLY_TARGET_MIN,
  addDays,
  applyDatePart,
  balanceToTarget,
  buildDefaultDays,
  changeMode,
  fillFromHiworks,
  formatHM,
  hoursCellText,
  nextMonday,
  parseWorkCalendar,
  shortDate,
  thisMonday,
  timeCellText,
  totalCreditMinutes,
} from "../lib/schedule";

const HELP = `유연근무제 신청서 CLI

사용법: flexwork <명령> [옵션]

명령:
  week       주간 신청서 작성/미리보기 (기본: 다음 주)
             --week this|next|YYYY-MM-DD   대상 주 (해당 주 월요일로 맞춤)
             --day <요일>=<값>             요일 지정, 여러 번 사용 가능
                 요일: 월..금 | mon..fri | 1..5
                 값:   09:30-18:20          근무(출근-퇴근)
                       holiday[:문구]       공휴일 (예: holiday:추석)
                       leave                연차(종일)
                       pm[:HH:MM]           연차(오후) — 오전 근무, 출근시각 지정 가능
                       am[:HH:MM]           연차(오전) — 오후 근무, 퇴근시각 지정 가능
             --hiworks / --no-hiworks      Hiworks 실제 근태 반영 (이번 주면 기본 on)
             --balance                     마지막 근무일 퇴근으로 40시간 자동 맞춤
             --apply-date YYYY-MM-DD       신청일 (기본: 월요일 3일 전)
             --fresh                       저장본 무시하고 기본 일정에서 시작
             --save                        제출 기록에 저장 (같은 주는 덮어씀)
             --docx [파일]                 Word 파일 생성 (기본: MMDD.docx)
  hiworks    Hiworks 근태 조회 (--week this|next|YYYY-MM-DD, --raw 원본 JSON)
  list       제출 기록 목록
  show <id|YYYY-MM-DD>     제출 기록 상세
  docx <id|YYYY-MM-DD> [-o 파일]   제출 기록을 Word 로 저장
  delete <id|YYYY-MM-DD> [--yes]   제출 기록 삭제
  settings                 기본 정보 보기
  settings set key=값 ...  기본 정보 수정 (company department birth name coreTime)

예:
  flexwork week --day 수=holiday:개천절 --balance --save --docx
  flexwork week --week this --docx ~/Desktop/
`;

// ---- 출력 헬퍼 ----

// 한글 등 전각 문자는 터미널에서 2칸 차지
function width(s: string): number {
  let w = 0;
  for (const ch of s) w += /[ᄀ-ᇿ　-鿿가-힯＀-￯]/.test(ch) ? 2 : 1;
  return w;
}
function padEnd(s: string, n: number): string {
  return s + " ".repeat(Math.max(0, n - width(s)));
}

function printTable(rows: string[][]) {
  const cols = rows[0].map((_, c) => Math.max(...rows.map((r) => width(r[c]))));
  for (const r of rows) console.log(r.map((v, c) => padEnd(v, cols[c])).join("  ").trimEnd());
}

function printWeek(e: Omit<Entry, "id" | "createdAt">) {
  console.log(
    `신청기간 ${shortDate(e.periodStart)} ~ ${shortDate(e.periodEnd)}   신청일 ${applyDatePart(e.applyDate).replace(/\s+/g, " ")}`
  );
  printTable([
    ["요일", "날짜", "구분", "근무시간", "시간"],
    ...e.days.map((d) => [
      d.weekday,
      shortDate(d.date),
      DAY_MODE_LABEL[d.mode],
      timeCellText(d),
      hoursCellText(d),
    ]),
  ]);
  const total = totalCreditMinutes(e.days);
  const diff = total - WEEKLY_TARGET_MIN;
  const mark =
    diff === 0 ? "✓" : diff > 0 ? `(+${formatHM(diff)} 초과)` : `(${formatHM(-diff)} 부족)`;
  console.log(`합계 ${formatHM(total)} / 40시간 ${mark}`);
}

function printSettings(s: Settings) {
  printTable(
    (Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]).map((k) => [k, s[k] || "(비어 있음)"])
  );
}

// ---- 인자 해석 ----

function resolveMonday(week: string | undefined): string {
  if (!week || week === "next") return nextMonday();
  if (week === "this") return thisMonday();
  if (/^\d{4}-\d{2}-\d{2}$/.test(week)) return thisMonday(new Date(week + "T00:00:00"));
  throw new Error(`--week 값이 올바르지 않습니다: ${week}`);
}

const DAY_KEYS: Record<string, number> = {
  월: 0, 화: 1, 수: 2, 목: 3, 금: 4,
  mon: 0, tue: 1, wed: 2, thu: 3, fri: 4,
  "1": 0, "2": 1, "3": 2, "4": 3, "5": 4,
};
const HM_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;
const normHM = (s: string) => (s.length === 4 ? "0" + s : s);

interface DayOverride {
  index: number;
  mode: DayMode;
  start?: string;
  end?: string;
  holidayText?: string;
}

function parseDayOverride(spec: string): DayOverride {
  const eq = spec.indexOf("=");
  if (eq < 0) throw new Error(`--day 형식은 <요일>=<값> 입니다: ${spec}`);
  const key = spec.slice(0, eq).trim().toLowerCase().replace(/요일$/, "");
  const val = spec.slice(eq + 1).trim();
  const index = DAY_KEYS[key];
  if (index === undefined) throw new Error(`알 수 없는 요일: ${key}`);

  const range = val.match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
  if (range) {
    const [start, end] = [normHM(range[1]), normHM(range[2])];
    if (!HM_RE.test(start) || !HM_RE.test(end)) throw new Error(`시각 형식 오류: ${val}`);
    return { index, mode: "work", start, end };
  }

  const colon = val.indexOf(":");
  const head = (colon < 0 ? val : val.slice(0, colon)).toLowerCase();
  const arg = colon < 0 ? "" : val.slice(colon + 1).trim();
  switch (head) {
    case "work":
    case "근무":
      return { index, mode: "work" };
    case "holiday":
    case "공휴일":
      return { index, mode: "holiday", holidayText: arg || "공휴일" };
    case "leave":
    case "leave_full":
    case "연차":
    case "휴가":
      return { index, mode: "leave_full" };
    case "pm":
    case "leave_pm":
    case "오후반차": {
      const start = arg ? normHM(arg) : undefined;
      if (start && !HM_RE.test(start)) throw new Error(`시각 형식 오류: ${arg}`);
      return { index, mode: "leave_pm", start };
    }
    case "am":
    case "leave_am":
    case "오전반차": {
      const end = arg ? normHM(arg) : undefined;
      if (end && !HM_RE.test(end)) throw new Error(`시각 형식 오류: ${arg}`);
      return { index, mode: "leave_am", end };
    }
  }
  throw new Error(`알 수 없는 값: ${val}`);
}

async function findEntry(ref: string): Promise<StoredEntry> {
  const list = await getEntries(LOCAL_USER);
  const e = /^\d{4}-\d{2}-\d{2}$/.test(ref)
    ? list.find((x) => x.periodStart === thisMonday(new Date(ref + "T00:00:00")))
    : list.find((x) => x.id === ref);
  if (!e) throw new Error(`제출 기록을 찾을 수 없습니다: ${ref}`);
  return e;
}

async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

async function writeDocx(entry: Entry, out: string | undefined, userCwd: string) {
  let file = path.resolve(userCwd, out || docxFilename(entry));
  // 디렉터리를 주면 그 안에 MMDD.docx
  if (out && (out.endsWith("/") || (await fs.stat(file).catch(() => null))?.isDirectory())) {
    file = path.join(file, docxFilename(entry));
  }
  await fs.writeFile(file, await buildDocx(entry));
  console.log(`Word 저장: ${file}`);
}

// ---- Hiworks: 환경변수 쿠키 → 자격증명 자동 로그인(OTP면 프롬프트) ----

async function hiworksCalendar(start: string, end: string): Promise<unknown> {
  const query = { start, end };
  const expired = (s: number) => s === 401 || s === 419;

  const envCookie = getEnvCookie();
  if (envCookie) {
    const r = await fetchWorkCalendar(envCookie, query);
    if (!expired(r.status)) {
      if (!r.ok) throw new Error(`Hiworks 조회 실패 (HTTP ${r.status})`);
      return r.data;
    }
  }

  const creds = getEnvCreds();
  if (!creds) {
    throw new Error(
      envCookie
        ? "HIWORKS_COOKIE 가 만료됐습니다. 새 쿠키로 교체하세요."
        : "Hiworks 자격증명이 없습니다. .env.local 에 HIWORKS_ID/HIWORKS_PASSWORD 를 설정하세요."
    );
  }

  let login = await loginWithCreds(creds);
  if (!login.ok && login.otpRequired) {
    const code = await ask("Hiworks OTP 코드: ");
    login = await completeOtp(login.pending, code);
  }
  if (!login.ok) {
    throw new Error(`Hiworks ${"error" in login ? login.error : "로그인 실패"} (HTTP ${"status" in login ? login.status : "?"})`);
  }

  const r = await fetchWorkCalendar(login.cookie, query);
  if (!r.ok) throw new Error(`Hiworks 조회 실패 (HTTP ${r.status})`);
  return r.data;
}

// ---- 명령 ----

async function cmdWeek(args: string[], userCwd: string): Promise<number> {
  const { values } = parseArgs({
    args,
    options: {
      week: { type: "string" },
      day: { type: "string", multiple: true },
      hiworks: { type: "boolean" },
      "no-hiworks": { type: "boolean" },
      balance: { type: "boolean" },
      "apply-date": { type: "string" },
      fresh: { type: "boolean" },
      save: { type: "boolean" },
      docx: { type: "string" },
    },
  });
  // --docx 를 값 없이 쓰면 parseArgs가 거부하므로 main에서 "" 로 보정해 둠
  const monday = resolveMonday(values.week);
  const overrides = (values.day ?? []).map(parseDayOverride);

  // 1) 시작점: 같은 주 저장본 → 없으면 기본 일정
  const saved = values.fresh
    ? undefined
    : (await getEntries(LOCAL_USER)).find((e) => e.periodStart === monday);
  let days: DayEntry[];
  let settings: Settings;
  let applyDate = addDays(monday, -3);
  if (saved) {
    days = saved.days.map((d, i) => ({
      ...d,
      date: addDays(monday, i),
      weekday: WEEKDAY_LABELS[i],
      holidayText: d.mode === "holiday" ? d.holidayText || "공휴일" : "",
    }));
    settings = saved.settings;
    applyDate = saved.applyDate;
    console.log(`(저장된 ${shortDate(monday)} 주 기록에서 시작)`);
  } else {
    days = buildDefaultDays(monday);
    settings = await getSettings();
  }
  if (values["apply-date"]) applyDate = values["apply-date"];

  // 2) 모드 변경 먼저 (Hiworks는 근무일만 채우므로)
  for (const o of overrides) {
    days[o.index] = changeMode(days[o.index], o.mode);
    if (o.holidayText) days[o.index].holidayText = o.holidayText;
  }

  // 3) Hiworks 실제 근태 반영 (이번 주면 기본)
  const useHiworks = values["no-hiworks"] ? false : values.hiworks ?? monday === thisMonday();
  if (useHiworks) {
    const rows = parseWorkCalendar(await hiworksCalendar(monday, addDays(monday, 4)));
    days = fillFromHiworks(days, rows);
    console.log(`(Hiworks 근무시간 반영: ${rows.length}일치)`);
  }

  // 4) 명시한 시각은 Hiworks 값보다 우선
  for (const o of overrides) {
    if (o.start) days[o.index].start = o.start;
    if (o.end) days[o.index].end = o.end;
  }

  if (values.balance) {
    const r = balanceToTarget(days);
    if (!r.ok) {
      console.error(r.error);
      return 1;
    }
    days = r.days;
    console.log(`(${days[r.index].weekday} 퇴근시각을 ${r.end}로 조정)`);
  }

  const draft = { periodStart: monday, periodEnd: addDays(monday, 4), applyDate, days, settings };
  console.log();
  printWeek(draft);

  const empty = (Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]).filter((k) => !settings[k].trim());
  if (empty.length) console.log(`\n⚠ 기본 정보 비어 있음: ${empty.join(", ")}  → flexwork settings set ...`);

  if (values.save) {
    const existing = (await getEntries(LOCAL_USER)).find((e) => e.periodStart === monday);
    const entry: StoredEntry = {
      id: existing?.id || newId(),
      userId: LOCAL_USER,
      createdAt: new Date().toISOString(),
      ...draft,
      settings: cleanSettings(settings),
    };
    await saveEntry(entry);
    await saveSettings(entry.settings);
    console.log(`\n제출 기록 저장 (id: ${entry.id}${existing ? ", 덮어씀" : ""})`);
  }
  if (values.docx !== undefined) {
    await writeDocx({ id: "preview", createdAt: new Date().toISOString(), ...draft }, values.docx, userCwd);
  }
  return 0;
}

async function cmdHiworks(args: string[]): Promise<number> {
  const { values } = parseArgs({
    args,
    options: { week: { type: "string" }, raw: { type: "boolean" } },
  });
  const monday = resolveMonday(values.week ?? "this");
  const data = await hiworksCalendar(monday, addDays(monday, 4));
  if (values.raw) {
    console.log(JSON.stringify(data, null, 2));
    return 0;
  }
  const rows: WorkDay[] = parseWorkCalendar(data);
  if (!rows.length) {
    console.log("조회된 근태 기록이 없습니다.");
    return 0;
  }
  printTable([
    ["날짜", "출근", "퇴근"],
    ...rows.map((r) => [shortDate(r.date), r.start ?? "-", r.end ?? "-"]),
  ]);
  return 0;
}

async function cmdList(): Promise<number> {
  const list = await getEntries(LOCAL_USER);
  if (!list.length) {
    console.log("제출 기록이 없습니다.");
    return 0;
  }
  printTable([
    ["id", "신청기간", "합계", "저장시각"],
    ...list.map((e) => [
      e.id,
      `${e.periodStart} ~ ${shortDate(e.periodEnd)}`,
      formatHM(totalCreditMinutes(e.days)),
      new Date(e.createdAt).toLocaleString("ko-KR"),
    ]),
  ]);
  return 0;
}

async function cmdSettings(args: string[]): Promise<number> {
  if (args[0] !== "set") {
    printSettings(await getSettings());
    return 0;
  }
  const patch: Record<string, string> = {};
  for (const kv of args.slice(1)) {
    const eq = kv.indexOf("=");
    const key = eq < 0 ? "" : kv.slice(0, eq);
    if (!(key in DEFAULT_SETTINGS)) {
      throw new Error(`알 수 없는 항목: ${kv} (가능: ${Object.keys(DEFAULT_SETTINGS).join(", ")})`);
    }
    patch[key] = kv.slice(eq + 1);
  }
  if (!Object.keys(patch).length) throw new Error("사용법: flexwork settings set name=홍길동 ...");
  printSettings(await saveSettings(patch));
  return 0;
}

export async function main(argv: string[], userCwd: string): Promise<number> {
  const [cmd, ...rest] = argv;
  // "--docx" 뒤에 파일명이 없으면 빈 문자열을 끼워 넣음 (기본 파일명 사용)
  const args = rest.flatMap((a, i) =>
    a === "--docx" && (i === rest.length - 1 || rest[i + 1].startsWith("--")) ? [a, ""] : [a]
  );

  switch (cmd) {
    case "week":
    case "plan":
      return cmdWeek(args, userCwd);
    case "hiworks":
      return cmdHiworks(args);
    case "list":
    case "ls":
      return cmdList();
    case "show": {
      if (!args[0]) throw new Error("사용법: flexwork show <id|YYYY-MM-DD>");
      const e = await findEntry(args[0]);
      console.log(`id ${e.id}  (저장 ${new Date(e.createdAt).toLocaleString("ko-KR")})`);
      printWeek(e);
      console.log();
      printSettings(e.settings);
      return 0;
    }
    case "docx": {
      const { values, positionals } = parseArgs({
        args,
        options: { out: { type: "string", short: "o" } },
        allowPositionals: true,
      });
      if (!positionals[0]) throw new Error("사용법: flexwork docx <id|YYYY-MM-DD> [-o 파일]");
      await writeDocx(await findEntry(positionals[0]), values.out, userCwd);
      return 0;
    }
    case "delete":
    case "rm": {
      const { values, positionals } = parseArgs({
        args,
        options: { yes: { type: "boolean", short: "y" } },
        allowPositionals: true,
      });
      if (!positionals[0]) throw new Error("사용법: flexwork delete <id|YYYY-MM-DD> [--yes]");
      const e = await findEntry(positionals[0]);
      if (!values.yes) {
        const a = await ask(`${e.periodStart} 주 기록(id ${e.id})을 삭제할까요? [y/N] `);
        if (!/^y(es)?$/i.test(a)) {
          console.log("취소했습니다.");
          return 1;
        }
      }
      await deleteEntry(LOCAL_USER, e.id);
      console.log("삭제했습니다.");
      return 0;
    }
    case "settings":
      return cmdSettings(args);
    case undefined:
    case "help":
    case "-h":
    case "--help":
      console.log(HELP);
      return 0;
  }
  console.error(`알 수 없는 명령: ${cmd}\n`);
  console.log(HELP);
  return 1;
}
