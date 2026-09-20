import {
  MIN_PASSWORD,
  hashPassword,
  isValidUsername,
  verifyPassword,
} from "./auth";
import {
  createUser,
  findUserByUsername,
  migrateLegacyData,
  removeUserSessions,
  updateUser,
} from "./db";
import { DEFAULT_SETTINGS } from "./schedule";

// 서버 시작 시 호출(src/instrumentation.ts).
// ADMIN_USERNAME / ADMIN_PASSWORD 계정을 관리자로 만들거나 맞추고,
// 다중 사용자 이전 데이터를 그 계정으로 옮긴다. 재시작마다 불려도 결과는 같다.
export async function ensureAdmin() {
  const username = (process.env.ADMIN_USERNAME ?? "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "";

  if (!username || !password) {
    console.warn(
      "[flexwork] ADMIN_USERNAME / ADMIN_PASSWORD 가 없어 관리자 계정을 만들지 않았습니다. 기존 데이터도 이관되지 않습니다."
    );
    return;
  }
  if (!isValidUsername(username) || password.length < MIN_PASSWORD) {
    console.error(
      `[flexwork] ADMIN_USERNAME은 영문·숫자·( _ . - ) 3~20자, ADMIN_PASSWORD는 ${MIN_PASSWORD}자 이상이어야 합니다.`
    );
    return;
  }

  let admin = await findUserByUsername(username);
  if (!admin) {
    const created = await createUser({
      username,
      passwordHash: await hashPassword(password),
      role: "admin",
      settings: DEFAULT_SETTINGS,
    });
    if (!created) return;
    admin = created;
    console.log(`[flexwork] 관리자 계정 생성: ${username}`);
  } else {
    // 관리자 비밀번호는 환경변수가 기준: 값이 바뀌었으면 갱신하고 기존 로그인 해제
    const passwordChanged = !(await verifyPassword(password, admin.passwordHash));
    if (admin.role !== "admin" || passwordChanged) {
      const patch: { role: "admin"; passwordHash?: string } = { role: "admin" };
      if (passwordChanged) patch.passwordHash = await hashPassword(password);
      await updateUser(admin.id, patch);
      if (passwordChanged) await removeUserSessions(admin.id);
      console.log(
        `[flexwork] 관리자 계정 갱신: ${username}` +
          (passwordChanged ? " (비밀번호 변경, 기존 로그인 해제)" : "")
      );
    }
  }

  const moved = await migrateLegacyData(admin.id);
  if (moved.settings || moved.entries > 0) {
    console.log(
      `[flexwork] 기존 데이터 → ${username}: 기본 정보 ${
        moved.settings ? "이관" : "없음"
      }, 제출 기록 ${moved.entries}건`
    );
  }
}
