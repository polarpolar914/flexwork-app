import { appendFile, mkdir, readdir, stat, unlink } from "fs/promises";
import path from "path";

// 앱 실행 로그를 logs/ 에 날짜별 파일로 남기고, 오래된 파일은 자동 삭제한다.
// 서버 시작 시(src/instrumentation.ts)에 한 번 시작하면 이후 매일 알아서 정리한다.

const LOG_DIR = path.join(process.cwd(), "logs");
const RETENTION_DAYS = Math.max(1, Number(process.env.LOG_RETENTION_DAYS) || 14);
const DAY_MS = 24 * 60 * 60 * 1000;

// dev 서버는 모듈을 여러 번 로드할 수 있어 globalThis로 중복 설치·중복 타이머를 막는다.
const g = globalThis as typeof globalThis & {
  __fwLog?: { installed: boolean; timer?: ReturnType<typeof setInterval> };
};
const state = (g.__fwLog ??= { installed: false });

function logFile(): string {
  const ymd = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return path.join(LOG_DIR, `app-${ymd}.log`);
}

// 콘솔 색상용 ANSI 이스케이프 코드 제거(로그 파일을 깔끔하게).
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m/g;

function safeStringify(v: unknown): string {
  const s =
    typeof v === "string"
      ? v
      : (() => {
          try {
            return JSON.stringify(v);
          } catch {
            return String(v);
          }
        })();
  return s.replace(ANSI_RE, "");
}

// 보관 기간(RETENTION_DAYS)을 넘긴 로그 파일 삭제. 파일명의 날짜 우선, 없으면 수정시각 기준.
export async function pruneOldLogs(): Promise<number> {
  let removed = 0;
  const cutoff = Date.now() - RETENTION_DAYS * DAY_MS;
  let files: string[];
  try {
    files = await readdir(LOG_DIR);
  } catch {
    return 0; // logs 디렉터리가 아직 없음
  }
  for (const f of files) {
    if (!f.endsWith(".log")) continue;
    const full = path.join(LOG_DIR, f);
    try {
      const m = f.match(/(\d{4}-\d{2}-\d{2})/);
      const when = m
        ? new Date(m[1] + "T00:00:00Z").getTime()
        : (await stat(full)).mtimeMs;
      if (when < cutoff) {
        await unlink(full);
        removed++;
      }
    } catch {
      /* 한 파일 실패는 무시하고 계속 */
    }
  }
  return removed;
}

// console.* 출력을 파일에도 남긴다(원래 콘솔 출력은 유지). 파일 쓰기 실패는 앱에 영향 없음.
function installFileLogging() {
  if (state.installed) return;
  state.installed = true;
  const levels = ["log", "info", "warn", "error", "debug"] as const;
  const c = console as unknown as Record<string, (...a: unknown[]) => void>;
  for (const level of levels) {
    const orig = c[level].bind(console);
    c[level] = (...args: unknown[]) => {
      orig(...args);
      const line =
        `${new Date().toISOString()} [${level.toUpperCase()}] ` +
        args.map(safeStringify).join(" ") +
        "\n";
      appendFile(logFile(), line).catch(() => {});
    };
  }
}

// 서버 시작 시 호출: 로그 디렉터리 준비 → 파일 로깅 설치 → 오래된 로그 정리(즉시 + 매일).
export async function startLogMaintenance() {
  try {
    await mkdir(LOG_DIR, { recursive: true });
  } catch {
    /* 무시 */
  }
  installFileLogging();

  const run = () =>
    pruneOldLogs()
      .then((n) => {
        if (n > 0) {
          console.log(`[logs] 오래된 로그 ${n}개 삭제 (보관 ${RETENTION_DAYS}일)`);
        }
      })
      .catch(() => {});

  run();
  if (!state.timer) {
    state.timer = setInterval(run, DAY_MS);
    // 이 타이머 때문에 프로세스가 종료를 못 하는 일이 없도록
    state.timer.unref?.();
  }
}
