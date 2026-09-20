import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/cookie";

// 페이지 요청마다: 로그인 쿠키가 없으면 /login으로 보내고, 있으면 만료를 다시 연장(슬라이딩).
// 쿠키 유무만 보는 1차 관문. 실제 세션 검증은 각 페이지·API가 서버 DB로 한다.
export function middleware(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const { pathname, search } = req.nextUrl;

  if (!token) {
    if (pathname === "/login") return NextResponse.next();
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }

  const res = NextResponse.next();
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(req));
  return res;
}

export const config = {
  // API(자체 401 처리)·Next 내부 파일·dev 오버레이 제외
  matcher: ["/((?!api|_next|__nextjs|favicon.ico).*)"],
};
