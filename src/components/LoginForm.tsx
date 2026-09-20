"use client";

import { useState } from "react";

type Mode = "login" | "signup";

export default function LoginForm({ next }: { next: string }) {
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function switchMode(m: Mode) {
    setMode(m);
    setError(null);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (mode === "signup" && password !== password2) {
      setError("비밀번호가 서로 다릅니다.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password, name }),
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
        <div className="auth-tabs">
          <button
            type="button"
            className={mode === "login" ? "active" : ""}
            onClick={() => switchMode("login")}
          >
            로그인
          </button>
          <button
            type="button"
            className={mode === "signup" ? "active" : ""}
            onClick={() => switchMode("signup")}
          >
            회원가입
          </button>
        </div>

        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="username">아이디</label>
            <input
              id="username"
              autoComplete="username"
              autoCapitalize="none"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="field">
            <label htmlFor="password">비밀번호</label>
            <input
              id="password"
              type="password"
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {mode === "signup" && (
            <>
              <div className="field">
                <label htmlFor="password2">비밀번호 확인</label>
                <input
                  id="password2"
                  type="password"
                  autoComplete="new-password"
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="name">이름</label>
                <input
                  id="name"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
                <div className="hint">신청서의 성명 칸에 들어갑니다.</div>
              </div>
            </>
          )}

          {error && <div className="toast err">{error}</div>}
          <button className="primary auth-submit" type="submit" disabled={busy}>
            {mode === "login" ? "로그인" : "가입하고 시작하기"}
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
