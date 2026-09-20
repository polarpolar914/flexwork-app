import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth";
import {
  getHiworksCookie,
  getHiworksCreds,
  saveHiworksCookie,
} from "@/lib/db";
import { fetchWorkCalendar, type WorkCalendarQuery } from "@/lib/hiworks";
import {
  completeOtp,
  loginWithCreds,
  putPending,
  takePending,
} from "@/lib/hiworks-login";

// GET /api/hiworks/calendar?start=2026-09-14&end=2026-09-20[&otp=123456]
//
// 온디맨드 자동 로그인:
//  1) 캐시된 쿠키가 있으면 그걸로 조회. 401(만료)이면 재로그인으로 폴백.
//  2) 저장된 자격증명으로 로그인 → 쿠키 캐시 → 재조회.
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
      const pending = takePending(user.id);
      if (!pending) {
        return NextResponse.json(
          { error: "OTP 대기 세션이 만료됐습니다. 다시 시도하세요." },
          { status: 400 }
        );
      }
      const r = await completeOtp(pending, otp);
      if (!r.ok) {
        return NextResponse.json(
          { error: "error" in r ? r.error : "OTP 실패", detail: "detail" in r ? r.detail : undefined },
          { status: 401 }
        );
      }
      await saveHiworksCookie(user.id, r.cookie);
      const out = await tryFetch(r.cookie);
      return out === "expired"
        ? NextResponse.json({ error: "로그인 후에도 조회 실패" }, { status: 502 })
        : out;
    }

    // --- 1) 캐시 쿠키 우선 ---
    const cached = await getHiworksCookie(user.id);
    if (cached) {
      const out = await tryFetch(cached);
      if (out !== "expired") return out; // 성공/기타 응답은 그대로
      // 만료 → 아래 재로그인
    }

    // --- 2) 저장된 자격증명으로 자동 로그인 ---
    const creds = await getHiworksCreds(user.id);
    if (!creds) {
      return NextResponse.json(
        {
          error:
            "자동 로그인 자격증명이 없습니다. 설정에서 Hiworks id/비번을 등록하거나 쿠키를 넣으세요.",
        },
        { status: 400 }
      );
    }

    const login = await loginWithCreds(creds);
    if (!login.ok && login.otpRequired) {
      putPending(user.id, login.pending);
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

    await saveHiworksCookie(user.id, login.cookie);
    const out = await tryFetch(login.cookie);
    return out === "expired"
      ? NextResponse.json({ error: "로그인 후에도 조회 실패" }, { status: 502 })
      : out;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "조회 실패";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
