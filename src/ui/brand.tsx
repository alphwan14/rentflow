import Image from "next/image";
import Link from "next/link";
import logo from "@/app/icon.png";

export function Brand({ href = "/home" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 rounded-full bg-card px-3 py-1.5 border border-line/70">
      <Image src={logo} alt="" width={22} height={22} className="rounded-md" priority />
      <span className="text-[15px] font-semibold tracking-tight">RentFlow</span>
    </Link>
  );
}
