// Hiworks 근태(HR-work) API 호출 — 서버에서만 실행.
// 브라우저에서 직접 부르면 (1) CORS로 막히고(응답이 hr-work.office.hiworks.com origin만
// 허용) (2) 인증 쿠키가 .hiworks.com 도메인이라 우리 사이트 JS가 못 보낸다.
// 그래서 서버가 대신 요청하고(서버-서버는 CORS 무관) 쿠키를 헤더에 직접 붙인다.

const CALENDAR_URL =
  "https://hr-work-api.office.hiworks.com/v4/my-work-data-calendar";

// 브라우저가 보내던 것과 동일하게 맞춘 헤더. 쿠키만 사용자별로 바뀐다.
const BROWSER_HEADERS = {
  accept: "application/json, text/plain, */*",
  "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
  origin: "https://hr-work.office.hiworks.com",
  referer: "https://hr-work.office.hiworks.com/",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36",
};

export interface WorkCalendarQuery {
  start: string; // yyyy-mm-dd (포함)
  end: string; // yyyy-mm-dd (포함)
  limit?: number; // 기본 25
  offset?: number; // 기본 0
}

export interface HiworksResult {
  status: number;
  ok: boolean;
  data: unknown; // 원본 JSON (파싱 실패 시 { raw: string })
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// gte/lte, limit/offset을 브라우저 요청과 동일한 대괄호 형식으로 조립.
// URLSearchParams는 대괄호를 %5B/%5D로 인코딩하는데 API가 그대로 받으므로 문제없다.
function buildUrl({ start, end, limit = 25, offset = 0 }: WorkCalendarQuery) {
  if (!DATE_RE.test(start) || !DATE_RE.test(end)) {
    throw new Error("start/end must be yyyy-mm-dd");
  }
  const qs = new URLSearchParams({
    "filter[work_date][gte]": start,
    "filter[work_date][lte]": end,
    "page[limit]": String(limit),
    "page[offset]": String(offset),
  });
  return `${CALENDAR_URL}?${qs.toString()}`;
}

// 주간 근태 캘린더 조회. cookie는 브라우저 devtools의 Cookie 헤더 문자열 그대로.
export async function fetchWorkCalendar(
  cookie: string,
  query: WorkCalendarQuery
): Promise<HiworksResult> {
  const res = await fetch(buildUrl(query), {
    method: "GET",
    headers: { ...BROWSER_HEADERS, cookie },
    cache: "no-store",
  });

  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text }; // 세션 만료 시 로그인 HTML이 오는 경우 등
  }
  return { status: res.status, ok: res.ok, data };
}
