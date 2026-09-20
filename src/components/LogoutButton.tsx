"use client";

export default function LogoutButton() {
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/login";
  }

  return (
    <button type="button" className="ghost" onClick={logout}>
      로그아웃
    </button>
  );
}
