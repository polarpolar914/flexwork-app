// 로그인 세션 쿠키 설정. middleware(Edge 런타임)에서도 쓰므로 Node 전용 모듈을 import하지 않는다.
export const SESSION_COOKIE = "fw_session";

// 브라우저는 쿠키 수명을 최대 400일로 자른다. middleware가 페이지를 열 때마다 다시
// 400일로 연장하므로, 400일 넘게 한 번도 접속하지 않는 경우가 아니면 계속 로그인 상태.
const MAX_AGE_SEC = 400 * 24 * 60 * 60;

export function sessionCookieOptions(req: Request) {
  const https =
    req.headers.get("x-forwarded-proto") === "https" ||
    new URL(req.url).protocol === "https:";
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: MAX_AGE_SEC,
    // http(사내망 IP 등)로 접속해도 쿠키가 저장되도록 https일 때만 Secure
    secure: https,
  };
}
