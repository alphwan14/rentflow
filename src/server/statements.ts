import "server-only";
import { parseStatementCsv, parseStatementPdfText, parseStatementTable } from "@/core/sources/mpesa-statement";
import { StatementFormatError, type ParseResult } from "@/core/sources/types";

export const MAX_STATEMENT_BYTES = 10 * 1024 * 1024;

/** Parse an uploaded M-Pesa statement: CSV, Excel (.xlsx) or PDF (optionally password-protected). */
export async function parseStatementFile(file: File, password?: string): Promise<ParseResult> {
  if (file.size === 0) throw new StatementFormatError("That file is empty.");
  if (file.size > MAX_STATEMENT_BYTES) throw new StatementFormatError("That file is too big. Upload one or two months at a time.");
  const name = file.name.toLowerCase();
  const bytes = new Uint8Array(await file.arrayBuffer());

  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    const { getDocumentProxy, extractText } = await import("unpdf");
    let pdf;
    try {
      pdf = await getDocumentProxy(bytes, password ? { password } : {});
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      if (/password/i.test(msg)) {
        throw new StatementFormatError(
          password
            ? "That password didn't open the PDF. Check the code Safaricom sent with the statement."
            : "This PDF is locked. Enter the password Safaricom sent with the statement.",
        );
      }
      throw new StatementFormatError("We couldn't open that PDF. Try the Excel or CSV version instead.");
    }
    const { text } = await extractText(pdf, { mergePages: true });
    return parseStatementPdfText(text);
  }

  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const { readSheet } = await import("read-excel-file/node");
    const rows = await readSheet(Buffer.from(bytes));
    return parseStatementTable(rows as unknown as Parameters<typeof parseStatementTable>[0]);
  }

  return parseStatementCsv(new TextDecoder("utf-8").decode(bytes));
}
