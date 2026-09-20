"use client";

import { useEffect, useState } from "react";
import HistoryList from "./HistoryList";
import { apiFetch } from "@/lib/api";
import type { UserSummary } from "@/lib/db";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR");
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function AdminPanel() {
  const [users, setUsers] = useState<UserSummary[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(
    null
  );

  async function load() {
    const res = await apiFetch("/api/admin/users");
    setUsers(await res.json());
  }

  useEffect(() => {
    load();
  }, []);

  function flash(kind: "ok" | "err", msg: string) {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 4000);
  }

  // 응답이 실패면 서버 메시지를 토스트로, 성공이면 목록 새로고침
  async function finish(res: Response, okMsg: string) {
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      flash("err", data?.error ?? "요청에 실패했습니다.");
      return;
    }
    flash("ok", okMsg);
    load();
  }

  async function resetPassword(u: UserSummary) {
    const password = prompt(
      `${u.name || u.username} (${u.username})의 새 비밀번호를 입력하세요. (6자 이상)`
    );
    if (password === null) return;
    const res = await apiFetch(`/api/admin/users/${u.id}/password`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    await finish(
      res,
      `${u.username} 비밀번호를 바꿨습니다. 기존 로그인은 모두 해제됐습니다.`
    );
  }

  async function remove(u: UserSummary) {
    if (
      !confirm(
        `${u.name || u.username} (${u.username}) 계정과 제출 기록 ${u.entryCount}건을 삭제할까요?\n되돌릴 수 없습니다.`
      )
    )
      return;
    const res = await apiFetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
    if (open === u.id) setOpen(null);
    await finish(res, `${u.username} 계정을 삭제했습니다.`);
  }

  if (users === null) return <div className="card muted">불러오는 중…</div>;
  const selected = users.find((u) => u.id === open);

  return (
    <>
      <div className="card">
        <h2>사용자 ({users.length}명)</h2>
        <div className="table-scroll">
          <table className="hist">
            <thead>
              <tr>
                <th>아이디</th>
                <th>이름</th>
                <th>부서</th>
                <th>가입일</th>
                <th>제출 기록</th>
                <th>최근 저장</th>
                <th>로그인 기기</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <b>{u.username}</b>
                    {u.role === "admin" && (
                      <span className="badge admin">관리자</span>
                    )}
                  </td>
                  <td>{u.name || "—"}</td>
                  <td>{u.department || "—"}</td>
                  <td className="muted">{fmtDate(u.createdAt)}</td>
                  <td>{u.entryCount}건</td>
                  <td className="muted">
                    {u.lastSavedAt ? fmtDateTime(u.lastSavedAt) : "—"}
                  </td>
                  <td>{u.sessionCount}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button
                      className="ghost"
                      onClick={() => setOpen(open === u.id ? null : u.id)}
                    >
                      {open === u.id ? "닫기" : "기록 보기"}
                    </button>
                    {u.role !== "admin" && (
                      <>
                        <button className="ghost" onClick={() => resetPassword(u)}>
                          비밀번호 초기화
                        </button>
                        <button className="ghost danger" onClick={() => remove(u)}>
                          삭제
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {toast && <div className={"toast " + toast.kind}>{toast.msg}</div>}
      </div>

      {selected && (
        <HistoryList
          key={selected.id}
          userId={selected.id}
          title={`${selected.name || selected.username}의 제출 기록`}
        />
      )}
    </>
  );
}
