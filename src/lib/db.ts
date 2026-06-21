import { promises as fs } from "fs";
import path from "path";
import { DEFAULT_SETTINGS, type Entry, type Settings } from "./schedule";

// 프로젝트 내 간단한 파일 DB (data/ 디렉터리)
const DATA_DIR = path.join(process.cwd(), "data");
const ENTRIES_FILE = path.join(DATA_DIR, "entries.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

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
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf-8");
}

export async function getEntries(): Promise<Entry[]> {
  const list = await readJson<Entry[]>(ENTRIES_FILE, []);
  // 최신순 정렬
  return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getEntry(id: string): Promise<Entry | undefined> {
  const list = await readJson<Entry[]>(ENTRIES_FILE, []);
  return list.find((e) => e.id === id);
}

export async function saveEntry(entry: Entry): Promise<Entry> {
  const list = await readJson<Entry[]>(ENTRIES_FILE, []);
  const idx = list.findIndex((e) => e.id === entry.id);
  if (idx >= 0) list[idx] = entry;
  else list.push(entry);
  await writeJson(ENTRIES_FILE, list);
  return entry;
}

export async function deleteEntry(id: string): Promise<void> {
  const list = await readJson<Entry[]>(ENTRIES_FILE, []);
  await writeJson(
    ENTRIES_FILE,
    list.filter((e) => e.id !== id)
  );
}

export async function getSettings(): Promise<Settings> {
  return readJson<Settings>(SETTINGS_FILE, DEFAULT_SETTINGS);
}

export async function saveSettings(s: Settings): Promise<Settings> {
  await writeJson(SETTINGS_FILE, s);
  return s;
}

export function newId(): string {
  // 시간 기반 + 랜덤 (충돌 방지). 서버에서만 호출.
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  );
}
