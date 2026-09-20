import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions } from "./cookie";
import { getSettings } from "./db";
import type { Settings } from "./schedule";

// 단일 계정: 로그인 비밀번호는 환경변수 APP_PASSWORD 하나로만 인증한다.
// 회원가입·다중 사용자·DB 세션 저장 없음. 세션은 HMAC 서명 쿠키(무상태)다.
function appPassword(): string {
  return process.env.APP_PASSWORD ?? "";
}

// 쿠키 서명 키. 없으면 APP_PASSWORD로 대체 → 비번을 바꾸면 기존 세션도 자동 무효.
function secret(): string {
  return (
    process.env.SESSION_SECRET ||
    process.env.APP_PASSWORD ||
    "flexwork-dev-secret"
  );
}

function hmac(input: string): Buffer {
  return createHmac("sha256", secret()).update(input).digest();
}

// 세션 토큰 = HMAC(secret,"authed:v1"). 비번/시크릿이 바뀌면 예전 토큰은 검증 실패.
function makeToken(): string {
  return hmac("authed:v1").toString("base64url");
}

function validToken(token?: string): boolean {
  if (!token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(makeToken());
  return a.length === b.length && timingSafeEqual(a, b);
}

// 입력 비번을 APP_PASSWORD와 상수시간 비교. env 미설정이면 항상 실패(로그인 불가).
export async function verifyAppPassword(password: string): Promise<boolean> {
  const expected = appPassword();
  if (!expected) return false;
  // 길이 노출 없이 비교하려고 양쪽을 HMAC 해서 고정 길이로 맞춤
  return timingSafeEqual(hmac("pw:" + password), hmac("pw:" + expected));
}

// 로그인 여부를 나타내는 최소 사용자 객체. 다중 사용자가 없으므로 id는 고정.
export interface CurrentUser {
  id: string;
  settings: Settings;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!validToken(token)) return null;
  return { id: "local", settings: await getSettings() };
}

export function startSession(res: NextResponse, req: Request) {
  res.cookies.set(SESSION_COOKIE, makeToken(), sessionCookieOptions(req));
}

export function endSession(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
}

export function unauthorized() {
  return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
}
