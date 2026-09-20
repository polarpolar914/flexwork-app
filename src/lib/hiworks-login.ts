// Hiworks 온디맨드 자동 로그인 — 서버 전용.
// 브라우저 SPA가 하던 OAuth 로그인을 서버가 그대로 재현한다:
//   1) hr-work 접속 → 로그인 페이지로 리다이렉트(XSRF-TOKEN 등 쿠키 + loginUrl 쿼리 확보)
//   2) POST auth-api.office.hiworks.com/oauth/authorization/login?<search> {id,password}
//   3) (OTP 오피스면) POST .../oauth/authorization/otp?<search> {otp_code}
//   4) 성공 응답의 302 체인을 따라가면 hr-work가 PHPSESSID/_hwtk 세팅 → 쿠키 수집
// 수집한 쿠키 문자열을 근태 API 호출에 사용한다.
//
// 비번을 저장/전송하는 민감 경로다. 절대 로그로 남기지 않는다(진단은 상류 status/헤더만).

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36";
const AUTH = "https://auth-api.office.hiworks.com";
const HRWORK = "https://hr-work.office.hiworks.com/";
const LOGIN_ORIGIN = "https://login.office.hiworks.com";

type Jar = Map<string, string>;

// ---- 쿠키 jar: 이름→값. 여러 하이웍스 서브도메인 쿠키를 한 통에 모아 그대로 전달
// (실제 브라우저도 근태 API에 하이웍스 쿠키를 통째로 보냄). 도메인 매칭은 단순화.
function updateJar(jar: Jar, res: Response) {
  const h = res.headers as Headers & { getSetCookie?: () => string[] };
  const list =
    typeof h.getSetCookie === "function"
      ? h.getSetCookie()
      : res.headers.get("set-cookie")
        ? [res.headers.get("set-cookie") as string]
        : [];
  for (const sc of list) {
    const first = sc.split(";", 1)[0];
    const eq = first.indexOf("=");
    if (eq <= 0) continue;
    const name = first.slice(0, eq).trim();
    const value = first.slice(eq + 1).trim();
    if (!name) continue;
    if (value === "" || value === "deleted") jar.delete(name);
    else jar.set(name, value);
  }
}

function cookieHeader(jar: Jar): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

interface ShotOpts {
  jar: Jar;
  method?: string;
  json?: unknown;
  referer?: string;
  origin?: string;
}

// 단발 요청(리다이렉트 수동). 요청 전 jar를 쿠키로 싣고, 응답 Set-Cookie를 jar에 반영.
async function oneShot(url: string, opts: ShotOpts): Promise<Response> {
  const headers: Record<string, string> = {
    "user-agent": UA,
    "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
  };
  const cookie = cookieHeader(opts.jar);
  if (cookie) headers.cookie = cookie;
  if (opts.referer) headers.referer = opts.referer;
  if (opts.origin) headers.origin = opts.origin;

  let body: string | undefined;
  if (opts.json !== undefined) {
    headers["content-type"] = "application/json";
    headers.accept = "application/json, text/plain, */*";
    body = JSON.stringify(opts.json);
    // axios가 XSRF-TOKEN 쿠키를 X-XSRF-TOKEN 헤더로 echo 하던 것 재현
    const xsrf = opts.jar.get("XSRF-TOKEN");
    if (xsrf) headers["x-xsrf-token"] = decodeURIComponent(xsrf);
  }

  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers,
    body,
    redirect: "manual",
    cache: "no-store",
  });
  updateJar(opts.jar, res);
  return res;
}

// 30x Location 체인을 GET으로 따라가며 쿠키 수집. 최종(비-리다이렉트) 응답 반환.
async function followGets(
  startUrl: string,
  jar: Jar,
  referer?: string,
  maxHops = 10
): Promise<{ res: Response; url: string }> {
  let url = startUrl;
  for (let i = 0; i < maxHops; i++) {
    const res = await oneShot(url, { jar, referer });
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      url = new URL(loc, url).toString();
      continue;
    }
    return { res, url };
  }
  throw new Error("리다이렉트가 너무 많습니다");
}

// OTP 대기용 중간 상태(직렬화 가능). 로그인 1단계 후 OTP가 필요하면 이걸 들고 있다가 2단계에 사용.
export interface HiworksPending {
  jar: [string, string][];
  search: string;
}

export type LoginResult =
  | { ok: true; cookie: string }
  | { ok: false; otpRequired: true; pending: HiworksPending }
  | { ok: false; otpRequired?: false; error: string; status?: number; detail?: unknown };

function toPending(jar: Jar, search: string): HiworksPending {
  return { jar: [...jar.entries()], search };
}
function fromPending(p: HiworksPending): Jar {
  return new Map(p.jar);
}

// 로그인 성공(302 체인)을 hr-work까지 따라가 세션 쿠키 확정.
async function finishRedirect(
  res: Response,
  fromUrl: string,
  jar: Jar
): Promise<string> {
  const loc = res.headers.get("location");
  if (loc) await followGets(new URL(loc, fromUrl).toString(), jar, LOGIN_ORIGIN + "/");
  // hr-work 루트를 한번 더 태워 PHPSESSID/_hwtk가 확실히 자리잡게 함
  await followGets(HRWORK, jar, HRWORK);
  return cookieHeader(jar);
}

// 성공/실패 판별이 애매한 2xx 응답에서 OTP 필요 여부를 추정.
// (오피스마다 응답 형태가 달라 첫 실 로그인 로그로 정확히 보정 예정)
function looksLikeOtp(status: number, data: unknown): boolean {
  if (status < 200 || status >= 300) return false;
  const s = JSON.stringify(data ?? "").toLowerCase();
  return /otp|one[_-]?time|2fa|need.*auth|multi_position/.test(s);
}

// 비밀 없는 단계별 진단 로그(비번/쿠키값 미포함, 상태/호스트/쿠키이름만).
function dbg(...a: unknown[]) {
  console.log("[hiworks-login]", ...a);
}

// ---- 1단계: id/password 로그인 ----
export async function loginWithCreds(creds: {
  id: string;
  password: string;
}): Promise<LoginResult> {
  const jar: Jar = new Map();

  // search(=OAuth 쿼리) 확보: hr-work가 HTTP 302를 주면 거기서, 아니면(200 SPA shell) 기본값.
  let search = `?loginUrl=${encodeURIComponent(HRWORK)}`;
  try {
    const entry = await followGets(HRWORK, jar, HRWORK);
    const u = new URL(entry.url);
    dbg("entry", u.host + u.pathname, "status", entry.res.status);
    if (u.host.startsWith("login") && u.search) search = u.search;
  } catch (e) {
    dbg("entry err", (e as Error).message);
  }

  // 쿠키/XSRF 시드: 로그인 페이지 + authorize 엔드포인트 GET
  await followGets(`${LOGIN_ORIGIN}/${search}`, jar, LOGIN_ORIGIN + "/").catch(() => {});
  if (!jar.get("XSRF-TOKEN")) {
    await oneShot(`${AUTH}/oauth/authorization${search}`, {
      jar,
      referer: LOGIN_ORIGIN + "/",
    }).catch(() => {});
  }

  // 브라우저 2단계 로그인(ID 입력 → "다음")이 하던 오피스 도메인 검증/설정 조회.
  // 이 단계가 서버 컨텍스트·쿠키를 세팅한다. 건너뛰면 실계정 로그인 POST가 500 난다.
  const officeDomain = creds.id.split("@")[1] ?? "";
  if (officeDomain) {
    await oneShot(`${AUTH}/validate/office-domain/${officeDomain}`, {
      jar,
      referer: LOGIN_ORIGIN + "/",
    }).catch(() => {});
    await oneShot(`${AUTH}/office-info/${officeDomain}/login-preferences`, {
      jar,
      referer: LOGIN_ORIGIN + "/",
    }).catch(() => {});
  }
  dbg("search", search, "cookies", [...jar.keys()]);

  // 로그인 POST (redirect 수동: 성공 시 302)
  // ip_security_level: 브라우저 기본값 "1"(Js.DEFAULT). 누락하면 실계정에서 500 난다.
  // 오피스 IP 보안 설정이 다르면 HIWORKS_IP_LEVEL 로 덮어씀("-1"|"1"|"2").
  const ipLevel = process.env.HIWORKS_IP_LEVEL || "1";
  const res = await oneShot(`${AUTH}/oauth/authorization/login${search}`, {
    jar,
    method: "POST",
    json: {
      id: creds.id,
      password: creds.password,
      ip_security_level: ipLevel,
    },
    origin: LOGIN_ORIGIN,
    referer: LOGIN_ORIGIN + "/",
  });

  dbg("login POST status", res.status, "location?", Boolean(res.headers.get("location")));

  // 성공: 3xx 리다이렉트
  if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
    const cookie = await finishRedirect(res, `${AUTH}/oauth/authorization/login`, jar);
    dbg("login ok, final cookies", [...jar.keys()]);
    return { ok: true, cookie };
  }

  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 300) };
  }

  dbg("login non-redirect body", JSON.stringify(data).slice(0, 200));

  // OTP 필요 추정 → 중간상태 보관 후 2단계 요청
  if (looksLikeOtp(res.status, data)) {
    return { ok: false, otpRequired: true, pending: toPending(jar, search) };
  }

  // 인증 실패 등: 상류 status/본문을 진단용으로 전달(비번은 포함 안 됨)
  return {
    ok: false,
    error: "로그인 실패",
    status: res.status,
    detail: data,
  };
}

// ---- 2단계: OTP 코드 제출 ----
export async function completeOtp(
  pending: HiworksPending,
  otpCode: string
): Promise<LoginResult> {
  const jar = fromPending(pending);
  const res = await oneShot(`${AUTH}/oauth/authorization/otp${pending.search}`, {
    jar,
    method: "POST",
    json: { otp_code: otpCode },
    origin: LOGIN_ORIGIN,
    referer: LOGIN_ORIGIN + "/",
  });

  if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
    const cookie = await finishRedirect(res, `${AUTH}/oauth/authorization/otp`, jar);
    return { ok: true, cookie };
  }

  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 300) };
  }
  return { ok: false, error: "OTP 인증 실패", status: res.status, detail: data };
}

// ---- 환경변수 자격증명 + 세션 쿠키 캐시(서버 메모리) ----
// 단일 계정이므로 DB에 저장하지 않고 env에서 읽는다.
export function getEnvCreds(): { id: string; password: string } | null {
  const id = (process.env.HIWORKS_ID ?? "").trim();
  const password = process.env.HIWORKS_PASSWORD ?? "";
  if (!id || !password) return null;
  return { id, password };
}

// 브라우저 DevTools에서 복사한 근태 세션 쿠키(선택). 자동 로그인이 막힐 때 쓰는 확실한 경로.
// 만료되면 다시 붙여넣어야 한다.
export function getEnvCookie(): string {
  return (process.env.HIWORKS_COOKIE ?? "").trim();
}

// 로그인으로 얻은 근태 세션 쿠키를 메모리에 캐시(재로그인 최소화). 서버 재시작 시 사라짐.
const gc = globalThis as typeof globalThis & { __hwCookie?: string };
export function getCachedCookie(): string {
  return gc.__hwCookie ?? "";
}
export function setCachedCookie(cookie: string) {
  gc.__hwCookie = cookie;
}
export function clearCachedCookie() {
  gc.__hwCookie = "";
}

// ---- OTP 대기 상태 임시 보관(서버 메모리, 5분 TTL) ----
// 온디맨드 흐름: 1단계에서 OTP 필요 → pending을 여기 저장하고 클라에 알림 →
// 클라가 OTP 코드와 함께 재요청 → 저장된 pending으로 2단계 진행.
const g = globalThis as typeof globalThis & {
  __hwPending?: Map<string, { pending: HiworksPending; exp: number }>;
};
const store = (g.__hwPending ??= new Map());
const TTL_MS = 5 * 60 * 1000;

export function putPending(userId: string, pending: HiworksPending) {
  store.set(userId, { pending, exp: Date.now() + TTL_MS });
}
export function takePending(userId: string): HiworksPending | null {
  const e = store.get(userId);
  store.delete(userId);
  if (!e || e.exp < Date.now()) return null;
  return e.pending;
}
