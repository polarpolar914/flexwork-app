import { createHash, randomBytes, scrypt, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions } from "./cookie";
import {
  addSession,
  findSession,
  getUser,
  removeSession,
  type User,
} from "./db";

export const MIN_PASSWORD = 6;
const USERNAME_RE = /^[a-z0-9_.-]{3,20}$/;

export function isValidUsername(username: string): boolean {
  return USERNAME_RE.test(username);
}

// ---- 비밀번호 (scrypt + 사용자별 salt) ----

function scryptKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, 64, (err, key) => (err ? reject(err) : resolve(key)))
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptKey(password, salt);
  return `scrypt:${salt.toString("hex")}:${key.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  const [algo, salt, key] = stored.split(":");
  if (algo !== "scrypt" || !salt || !key) return false;
  const actual = await scryptKey(password, Buffer.from(salt, "hex"));
  const expected = Buffer.from(key, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// 로그인/가입 요청 본문 → 아이디(소문자)·비밀번호·이름
export async function readCredentials(req: Request) {
  const body = ((await req.json().catch(() => null)) ?? {}) as Record<
    string,
    unknown
  >;
  return {
    username: String(body.username ?? "").trim().toLowerCase(),
    password: String(body.password ?? ""),
    name: String(body.name ?? "").trim(),
  };
}

// ---- 세션: 서버에 저장, 만료 없음 (로그아웃해야 끝남) ----

// DB에는 토큰 해시만 저장 → data/ 파일이 새어도 세션을 가로챌 수 없음
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function startSession(
  res: NextResponse,
  req: Request,
  userId: string
) {
  const token = randomBytes(32).toString("base64url");
  await addSession({
    tokenHash: hashToken(token),
    userId,
    createdAt: new Date().toISOString(),
  });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(req));
}

export async function endSession(res: NextResponse) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) await removeSession(hashToken(token));
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
}

// 현재 요청의 로그인 사용자 (서버 컴포넌트·라우트 핸들러용)
export async function getCurrentUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await findSession(hashToken(token));
  if (!session) return null;
  return (await getUser(session.userId)) ?? null;
}

export function unauthorized() {
  return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
}

// 관리자 API 공통: 관리자면 사용자, 아니면 바로 돌려줄 에러 응답
export async function requireAdmin(): Promise<User | NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  if (user.role !== "admin") {
    return NextResponse.json(
      { error: "관리자만 사용할 수 있습니다." },
      { status: 403 }
    );
  }
  return user;
}
