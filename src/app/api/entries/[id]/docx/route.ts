import { getCurrentUser, unauthorized } from "@/lib/auth";
import { getEntry } from "@/lib/db";
import { buildDocx, docxFilename } from "@/lib/docxgen";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const entry = await getEntry(user.id, id);
  if (!entry) {
    return new Response(JSON.stringify({ error: "not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

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
