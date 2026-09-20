import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth";
import { fetchWorkCalendar, type WorkCalendarQuery } from "@/lib/hiworks";
import {
  clearCachedCookie,
  completeOtp,
  getCachedCookie,
  getEnvCookie,
  getEnvCreds,
  loginWithCreds,
  putPending,
  setCachedCookie,
  takePending,
} from "@/lib/hiworks-login";

const PENDING_KEY = "local"; // 단일 계정

// GET /api/hiworks/calendar?start=2026-09-14&end=2026-09-20[&otp=123456]
//
// 온디맨드 자동 로그인(자격증명은 환경변수 HIWORKS_ID/HIWORKS_PASSWORD):
//  1) 캐시된 세션 쿠키가 있으면 그걸로 조회. 401(만료)이면 재로그인.
//  2) env 자격증명으로 로그인 → 쿠키 캐시 → 재조회.
//  3) OTP 오피스면 { otp_required:true } 반환 → 클라가 otp 붙여 재요청 → 완료.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const query: WorkCalendarQuery = {
    start: searchParams.get("start") ?? "",
    end: searchParams.get("end") ?? "",
    limit: Number(searchParams.get("limit") ?? 25),
    offset: Number(searchParams.get("offset") ?? 0),
  };
  const otp = searchParams.get("otp") ?? "";

  // 쿠키로 조회 시도. ok면 데이터, 401이면 만료(재로그인 필요) 신호.
  async function tryFetch(cookie: string): Promise<NextResponse | "expired"> {
    const r = await fetchWorkCalendar(cookie, query);
    if (r.status === 401 || r.status === 419) return "expired";
    return NextResponse.json(r.data, { status: r.ok ? 200 : r.status });
  }

  try {
    // --- OTP 2단계: 대기 중이던 로그인 마무리 ---
    if (otp) {
      const pending = takePending(PENDING_KEY);
      if (!pending) {
        return NextResponse.json(
          { error: "OTP 대기 세션이 만료됐습니다. 다시 시도하세요." },
          { status: 400 }
        );
      }
      const r = await completeOtp(pending, otp);
      if (!r.ok) {
        return NextResponse.json(
          {
            error: "error" in r ? r.error : "OTP 실패",
            detail: "detail" in r ? r.detail : undefined,
          },
          { status: 401 }
        );
      }
      setCachedCookie(r.cookie);
      const out = await tryFetch(r.cookie);
      return out === "expired"
        ? NextResponse.json({ error: "로그인 후에도 조회 실패" }, { status: 502 })
        : out;
    }

    // --- 1) 캐시 쿠키 우선 ---
    const cached = getCachedCookie();
    if (cached) {
      const out = await tryFetch(cached);
      if (out !== "expired") return out;
      clearCachedCookie(); // 만료 → 아래로
    }

    // --- 2) 환경변수 쿠키(HIWORKS_COOKIE) — 자동 로그인이 막힐 때 쓰는 확실한 경로 ---
    const envCookie = getEnvCookie();
    if (envCookie) {
      const out = await tryFetch(envCookie);
      if (out !== "expired") {
        setCachedCookie(envCookie); // 유효하면 캐시
        return out;
      }
      // 만료 → 자동 로그인으로 폴백(자격증명 있으면)
    }

    // --- 3) 환경변수 자격증명으로 자동 로그인 ---
    const creds = getEnvCreds();
    if (!creds) {
      return NextResponse.json(
        {
          error: envCookie
            ? "HIWORKS_COOKIE 가 만료됐습니다. 새 쿠키로 교체하세요."
            : "Hiworks 자격증명이 없습니다. HIWORKS_COOKIE 또는 HIWORKS_ID/HIWORKS_PASSWORD 를 설정하세요.",
        },
        { status: 400 }
      );
    }

    const login = await loginWithCreds(creds);
    if (!login.ok && login.otpRequired) {
      putPending(PENDING_KEY, login.pending);
      return NextResponse.json(
        { otp_required: true, message: "OTP 코드를 입력하세요." },
        { status: 202 }
      );
    }
    if (!login.ok) {
      return NextResponse.json(
        { error: login.error, status: login.status, detail: login.detail },
        { status: 401 }
      );
    }

    setCachedCookie(login.cookie);
    const out = await tryFetch(login.cookie);
    return out === "expired"
      ? NextResponse.json({ error: "로그인 후에도 조회 실패" }, { status: 502 })
      : out;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "조회 실패";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
