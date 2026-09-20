// Next.js가 서버를 시작할 때 한 번 호출.
export async function register() {
  // Node 런타임에서만. 이 if 블록 형태여야 Edge(middleware) 번들에서 fs 등을 빼 준다.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startLogMaintenance } = await import("@/lib/logger");
    try {
      await startLogMaintenance();
    } catch (e) {
      console.error("[logs] 로그 유지관리 시작 실패:", e);
    }
  }
}
