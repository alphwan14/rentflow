import Link from "next/link";
import { cx } from "./index";

/** Text wordmark. No images. */
export function Wordmark({ href = "/home", light = false }: { href?: string; light?: boolean }) {
  return (
    <Link href={href} className={cx("inline-flex min-h-11 items-center text-[17px] font-semibold tracking-tight", light ? "text-white" : "text-ink")}>
      RentFlow
    </Link>
  );
}
