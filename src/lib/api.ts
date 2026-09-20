// 클라이언트용 fetch: 세션이 끊겼으면(401, 예: 다른 탭에서 로그아웃) 로그인 화면으로 보냄
export async function apiFetch(
  url: string,
  init?: RequestInit
): Promise<Response> {
  const res = await fetch(url, { cache: "no-store", ...init });
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("로그인이 필요합니다.");
  }
  return res;
}
