"use client";

import { useState } from "react";

export default function LoginForm({ next }: { next: string }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "요청에 실패했습니다.");
      }
      // 전체 새로고침으로 이동해야 상단 메뉴(서버 레이아웃)도 로그인 상태로 다시 그려짐
      window.location.replace(next);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="card">
        <h1 style={{ marginTop: 0, fontSize: 20 }}>유연근무제 신청서</h1>
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="password">비밀번호</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoFocus
            />
          </div>

          {error && <div className="toast err">{error}</div>}
          <button className="primary auth-submit" type="submit" disabled={busy}>
            로그인
          </button>
        </form>
        <div className="hint auth-foot">
          한 번 로그인하면 이 브라우저에서는 로그아웃할 때까지 로그인 상태가
          유지됩니다.
        </div>
      </div>
    </div>
  );
}
