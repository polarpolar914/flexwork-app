import { promises as fs } from "fs";
import path from "path";
import { DEFAULT_SETTINGS, type Entry, type Settings } from "./schedule";

// 프로젝트 내 간단한 파일 DB (data/ 디렉터리). 단일 계정이므로 사용자 테이블은 없다.
const DATA_DIR = path.join(process.cwd(), "data");
const ENTRIES_FILE = path.join(DATA_DIR, "entries.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

// 단일 계정의 고정 소유자 id. 제출 기록에 이 값으로 태그해 둔다.
export const LOCAL_USER = "local";

export interface StoredEntry extends Entry {
  userId: string;
}

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, data: unknown) {
  await ensureDir();
  // 임시 파일에 쓴 뒤 교체 → 동시에 읽는 요청이 반쯤 쓰인 파일을 보지 않음
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf-8");
  await fs.rename(tmp, file);
}

// 같은 파일의 읽기-수정-쓰기를 한 번에 하나씩 실행 (동시 저장 유실 방지).
// dev 서버는 라우트마다 모듈을 따로 로드할 수 있어 globalThis에 보관.
const g = globalThis as typeof globalThis & {
  __fwLocks?: Map<string, Promise<void>>;
};
const locks = (g.__fwLocks ??= new Map<string, Promise<void>>());

function withLock<T>(file: string, fn: () => Promise<T>): Promise<T> {
  const result = (locks.get(file) ?? Promise.resolve()).then(fn);
  locks.set(
    file,
    result.then(
      () => {},
      () => {}
    )
  );
  return result;
}

// ---- 제출 기록 ----
// userId 인자는 단일 계정에서 항상 LOCAL_USER이지만, 기록 구조 호환을 위해 유지한다.

export async function getEntries(userId: string): Promise<StoredEntry[]> {
  const list = await readJson<StoredEntry[]>(ENTRIES_FILE, []);
  return list
    .filter((e) => e.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getEntry(
  userId: string,
  id: string
): Promise<StoredEntry | undefined> {
  const list = await readJson<StoredEntry[]>(ENTRIES_FILE, []);
  return list.find((e) => e.userId === userId && e.id === id);
}

export async function saveEntry(entry: StoredEntry): Promise<StoredEntry> {
  return withLock(ENTRIES_FILE, async () => {
    const list = await readJson<StoredEntry[]>(ENTRIES_FILE, []);
    const idx = list.findIndex(
      (e) => e.userId === entry.userId && e.id === entry.id
    );
    if (idx >= 0) list[idx] = entry;
    else list.push(entry);
    await writeJson(ENTRIES_FILE, list);
    return entry;
  });
}

export async function deleteEntry(userId: string, id: string): Promise<void> {
  await withLock(ENTRIES_FILE, async () => {
    const list = await readJson<StoredEntry[]>(ENTRIES_FILE, []);
    await writeJson(
      ENTRIES_FILE,
      list.filter((e) => !(e.userId === userId && e.id === id))
    );
  });
}

// ---- 기본 정보(신청서 공통 항목) : 단일 settings.json ----

// 알려진 문자열 항목만 받아들임 (클라이언트 입력 정리)
export function cleanSettings(
  input: unknown,
  base: Settings = DEFAULT_SETTINGS
): Settings {
  const src = (input ?? {}) as Partial<Record<keyof Settings, unknown>>;
  const out = { ...base };
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const v = src[key];
    if (typeof v === "string") out[key] = v;
  }
  return out;
}

export async function getSettings(): Promise<Settings> {
  return cleanSettings(await readJson<unknown>(SETTINGS_FILE, {}));
}

// 보낸 항목만 덮어쓰고 나머지는 기존값 유지
export async function saveSettings(s: unknown): Promise<Settings> {
  return withLock(SETTINGS_FILE, async () => {
    const current = cleanSettings(await readJson<unknown>(SETTINGS_FILE, {}));
    const next = cleanSettings(s, current);
    await writeJson(SETTINGS_FILE, next);
    return next;
  });
}

export function newId(): string {
  // 시간 기반 + 랜덤 (충돌 방지). 서버에서만 호출.
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
