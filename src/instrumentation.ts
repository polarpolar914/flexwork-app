// Next.js가 서버를 시작할 때 한 번 호출
export async function register() {
  // Node 서버에서만. 이 if 블록 형태여야 Edge(middleware) 번들에서 fs 등을 빼 준다.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureAdmin } = await import("@/lib/admin");
    try {
      await ensureAdmin();
    } catch (e) {
      // 관리자 준비에 실패해도 앱은 뜨도록
      console.error("[flexwork] 관리자 계정 준비 실패:", e);
    }
  }
}
