// CLI 진입점. db.ts가 모듈 로드 시점의 process.cwd()로 data/ 경로를 정하므로,
// 작업 디렉터리 이동과 .env.local 로드를 먼저 한 뒤 main을 불러온다.
import path from "path";

const ROOT = path.resolve(__dirname, "../..");
const userCwd = process.cwd();

for (const f of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(path.join(ROOT, f));
  } catch {
    /* 파일 없으면 무시 */
  }
}
process.chdir(ROOT);

// 날짜·출퇴근 구간 판단은 한국 시간 기준. 서버가 UTC여도 맞도록 기본값 지정.
process.env.TZ ||= "Asia/Seoul";

// 동적 import()는 bin 실행 시 tsx 훅을 거치지 않아 require 사용
const { main } = require("./main") as typeof import("./main");
main(process.argv.slice(2), userCwd)
  .then((code) => process.exit(code ?? 0))
  .catch((e) => {
    console.error("오류:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
