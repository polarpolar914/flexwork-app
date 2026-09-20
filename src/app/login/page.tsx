import { redirect } from "next/navigation";
import LoginForm from "@/components/LoginForm";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 로그인 후 돌아갈 경로: 이 사이트 내부 경로만 허용 (외부로 튕기는 리다이렉트 방지)
function safeNext(next: string | string[] | undefined): string {
  return typeof next === "string" &&
    next.startsWith("/") &&
    !next.startsWith("//") &&
    !next.startsWith("/\\")
    ? next
    : "/";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const next = safeNext((await searchParams).next);
  if (await getCurrentUser()) redirect(next);
  return <LoginForm next={next} />;
}
