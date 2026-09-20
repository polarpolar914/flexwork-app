import { promises as fs } from "fs";
import path from "path";
import { DEFAULT_SETTINGS, type Entry, type Settings } from "./schedule";

// 프로젝트 내 간단한 파일 DB (data/ 디렉터리)
const DATA_DIR = path.join(process.cwd(), "data");
const ENTRIES_FILE = path.join(DATA_DIR, "entries.json");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");
// 다중 사용자 이전의 단일 기본 정보 파일 → 관리자에게 이관한 뒤 이름을 바꿔 둠
const LEGACY_SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
const MIGRATED_SETTINGS_FILE = path.join(DATA_DIR, "settings.migrated.json");

export interface StoredEntry extends Entry {
  userId: string;
}

export type Role = "admin" | "user";

export interface User {
  id: string;
  username: string; // 로그인 아이디 (소문자)
  passwordHash: string;
  role: Role;
  createdAt: string;
  settings: Settings; // 이 사용자의 기본 정보
  // Hiworks 근태 API 호출용 쿠키(자동 로그인 결과 캐시 또는 수동 붙여넣기). settings와
  // 분리 보관 → 신청서 Entry에 딸려 저장되거나 DOCX로 새지 않게. 만료되면 재로그인.
  hiworksCookie?: string;
  // 온디맨드 자동 로그인용 자격증명. 사용자가 ②(비번 저장)을 택함 → 평문 저장.
  // id는 "아이디@오피스도메인"(예: myid@smartdoctor) 형태.
  hiworksId?: string;
  hiworksPassword?: string;
}

export interface Session {
  tokenHash: string; // 쿠키 토큰의 sha256 (원본 토큰은 저장하지 않음)
  userId: string;
  createdAt: string;
}

// 관리자 화면용 사용자 요약 (비밀번호 해시·Hiworks 쿠키 등 민감 정보 제외)
export interface UserSummary {
  id: string;
  username: string;
  role: Role;
  createdAt: string;
  name: string;
  department: string;
  entryCount: number;
  lastSavedAt: string | null;
  sessionCount: number; // 로그인돼 있는 브라우저 수
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

// 같은 파일의 읽기-수정-쓰기를 한 번에 하나씩 실행 (여러 사용자가 동시에 저장해도 유실 없음).
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

// ---- 제출 기록 (사용자별) ----

export async function getEntries(userId: string): Promise<StoredEntry[]> {
  const list = await readJson<StoredEntry[]>(ENTRIES_FILE, []);
  // 본인 기록만, 최신순 정렬
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

// 관리자용: 사용자 구분 없이 id로 찾기
export async function getEntryById(
  id: string
): Promise<StoredEntry | undefined> {
  const list = await readJson<StoredEntry[]>(ENTRIES_FILE, []);
  return list.find((e) => e.id === id);
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

// ---- 사용자 ----

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

export async function getUsers(): Promise<User[]> {
  return readJson<User[]>(USERS_FILE, []);
}

export async function getUser(id: string): Promise<User | undefined> {
  return (await getUsers()).find((u) => u.id === id);
}

export async function findUserByUsername(
  username: string
): Promise<User | undefined> {
  return (await getUsers()).find((u) => u.username === username);
}

// 아이디가 이미 있으면 null
export async function createUser(input: {
  username: string;
  passwordHash: string;
  role: Role;
  settings: Settings;
}): Promise<User | null> {
  return withLock(USERS_FILE, async () => {
    const users = await getUsers();
    if (users.some((u) => u.username === input.username)) return null;
    const user: User = {
      id: newId(),
      username: input.username,
      passwordHash: input.passwordHash,
      role: input.role,
      createdAt: new Date().toISOString(),
      settings: input.settings,
    };
    await writeJson(USERS_FILE, [...users, user]);
    return user;
  });
}

export async function updateUser(
  id: string,
  patch: Partial<Pick<User, "role" | "passwordHash">>
): Promise<void> {
  await withLock(USERS_FILE, async () => {
    const users = await getUsers();
    const user = users.find((u) => u.id === id);
    if (!user) return;
    Object.assign(user, patch);
    await writeJson(USERS_FILE, users);
  });
}

export async function saveUserSettings(
  userId: string,
  s: unknown
): Promise<Settings> {
  return withLock(USERS_FILE, async () => {
    const users = await getUsers();
    const user = users.find((u) => u.id === userId);
    if (!user) throw new Error("user not found");
    user.settings = cleanSettings(s, user.settings);
    await writeJson(USERS_FILE, users);
    return user.settings;
  });
}

// 계정 삭제: 계정 → 로그인 세션 → 제출 기록 순으로 모두 지움
export async function deleteUser(id: string): Promise<void> {
  await withLock(USERS_FILE, async () => {
    const users = await getUsers();
    await writeJson(
      USERS_FILE,
      users.filter((u) => u.id !== id)
    );
  });
  await removeUserSessions(id);
  await withLock(ENTRIES_FILE, async () => {
    const list = await readJson<StoredEntry[]>(ENTRIES_FILE, []);
    await writeJson(
      ENTRIES_FILE,
      list.filter((e) => e.userId !== id)
    );
  });
}

export async function listUserSummaries(): Promise<UserSummary[]> {
  const [users, entries, sessions] = await Promise.all([
    getUsers(),
    readJson<StoredEntry[]>(ENTRIES_FILE, []),
    readJson<Session[]>(SESSIONS_FILE, []),
  ]);
  return users.map((u) => {
    const mine = entries.filter((e) => e.userId === u.id);
    return {
      id: u.id,
      username: u.username,
      role: u.role,
      createdAt: u.createdAt,
      name: u.settings.name,
      department: u.settings.department,
      entryCount: mine.length,
      lastSavedAt: mine.reduce<string | null>(
        (max, e) => (!max || e.createdAt > max ? e.createdAt : max),
        null
      ),
      sessionCount: sessions.filter((s) => s.userId === u.id).length,
    };
  });
}

// 다중 사용자 이전 데이터(settings.json, 주인 없는 제출 기록)를 관리자에게 이관.
// settings.json은 이관 후 settings.migrated.json으로 바꿔 두므로 여러 번 불려도 한 번만 적용된다.
export async function migrateLegacyData(
  adminId: string
): Promise<{ settings: boolean; entries: number }> {
  let entries = 0;
  await withLock(ENTRIES_FILE, async () => {
    const list = await readJson<StoredEntry[]>(ENTRIES_FILE, []);
    entries = list.filter((e) => !e.userId).length;
    if (entries > 0) {
      await writeJson(
        ENTRIES_FILE,
        list.map((e) => (e.userId ? e : { ...e, userId: adminId }))
      );
    }
  });

  const legacy = await readJson<unknown>(LEGACY_SETTINGS_FILE, null);
  if (legacy) {
    await saveUserSettings(adminId, legacy);
    await fs.rename(LEGACY_SETTINGS_FILE, MIGRATED_SETTINGS_FILE);
  }
  return { settings: !!legacy, entries };
}

// ---- Hiworks 근태 쿠키 (사용자별, settings와 분리) ----

export async function getHiworksCookie(userId: string): Promise<string> {
  return (await getUser(userId))?.hiworksCookie ?? "";
}

export async function saveHiworksCookie(
  userId: string,
  cookie: string
): Promise<void> {
  await withLock(USERS_FILE, async () => {
    const users = await getUsers();
    const user = users.find((u) => u.id === userId);
    if (!user) throw new Error("user not found");
    const trimmed = cookie.trim();
    if (trimmed) user.hiworksCookie = trimmed;
    else delete user.hiworksCookie; // 빈 값이면 연결 해제
    await writeJson(USERS_FILE, users);
  });
}

// ---- Hiworks 자동 로그인 자격증명 (사용자별, 평문) ----

export interface HiworksCreds {
  id: string;
  password: string;
}

export async function getHiworksCreds(
  userId: string
): Promise<HiworksCreds | null> {
  const u = await getUser(userId);
  if (!u?.hiworksId || !u?.hiworksPassword) return null;
  return { id: u.hiworksId, password: u.hiworksPassword };
}

export async function saveHiworksCreds(
  userId: string,
  id: string,
  password: string
): Promise<void> {
  await withLock(USERS_FILE, async () => {
    const users = await getUsers();
    const user = users.find((u) => u.id === userId);
    if (!user) throw new Error("user not found");
    const i = id.trim();
    if (i && password) {
      user.hiworksId = i;
      user.hiworksPassword = password;
    } else {
      // 하나라도 비면 자격증명 삭제(자동 로그인 해제)
      delete user.hiworksId;
      delete user.hiworksPassword;
    }
    await writeJson(USERS_FILE, users);
  });
}

// ---- 로그인 세션 ----

export async function findSession(
  tokenHash: string
): Promise<Session | undefined> {
  const list = await readJson<Session[]>(SESSIONS_FILE, []);
  return list.find((s) => s.tokenHash === tokenHash);
}

export async function addSession(session: Session): Promise<void> {
  await withLock(SESSIONS_FILE, async () => {
    const list = await readJson<Session[]>(SESSIONS_FILE, []);
    await writeJson(SESSIONS_FILE, [...list, session]);
  });
}

export async function removeSession(tokenHash: string): Promise<void> {
  await withLock(SESSIONS_FILE, async () => {
    const list = await readJson<Session[]>(SESSIONS_FILE, []);
    await writeJson(
      SESSIONS_FILE,
      list.filter((s) => s.tokenHash !== tokenHash)
    );
  });
}

// 이 사용자의 모든 로그인 해제 (비밀번호 변경·계정 삭제 시)
export async function removeUserSessions(userId: string): Promise<void> {
  await withLock(SESSIONS_FILE, async () => {
    const list = await readJson<Session[]>(SESSIONS_FILE, []);
    await writeJson(
      SESSIONS_FILE,
      list.filter((s) => s.userId !== userId)
    );
  });
}

export function newId(): string {
  // 시간 기반 + 랜덤 (충돌 방지). 서버에서만 호출.
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  );
}
