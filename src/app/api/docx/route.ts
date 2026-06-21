import { buildDocx, docxFilename } from "@/lib/docxgen";
import type { Entry } from "@/lib/schedule";

// 저장하지 않고 현재 입력값으로 즉석 docx 생성
export async function POST(req: Request) {
  const body = (await req.json()) as Omit<Entry, "id" | "createdAt"> &
    Partial<Pick<Entry, "id" | "createdAt">>;

  const entry: Entry = {
    id: body.id || "preview",
    createdAt: body.createdAt || new Date().toISOString(),
    periodStart: body.periodStart,
    periodEnd: body.periodEnd,
    applyDate: body.applyDate,
    days: body.days,
    settings: body.settings,
  };

  const buf = await buildDocx(entry);
  const filename = docxFilename(entry);

  return new Response(new Uint8Array(buf), {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "content-disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(
        filename
      )}`,
    },
  });
}
