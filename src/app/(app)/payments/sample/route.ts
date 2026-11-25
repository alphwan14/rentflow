import { NextResponse } from "next/server";
import { ORG_ID } from "@/demo/data";
import { demoStatementCsv } from "@/demo/statement";
import { getSession } from "@/server/session";

/** Sample M-Pesa statement for this month, for the demo organisation only. */
export async function GET() {
  const s = await getSession();
  if (!s?.org || s.org.orgId !== ORG_ID) return new NextResponse("Not found", { status: 404 });
  const { filename, body } = demoStatementCsv();
  return new NextResponse(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
