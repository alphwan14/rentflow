import Image from "next/image";
import Link from "next/link";

/** RentFlow logo + wordmark — used consistently across app, receipts and statements. */
export function Brand({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const text = size === "lg" ? "text-2xl" : size === "sm" ? "text-base" : "text-xl";
  const px = size === "lg" ? 32 : size === "sm" ? 20 : 24;
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${text}`}>
      <Image
        src="/rentflow.png"
        alt="RentFlow logo"
        width={px}
        height={px}
        className="rounded-md"
        priority
      />
      <span>
        Rent<span className="text-brand">Flow</span>
      </span>
    </span>
  );
}

export function BrandLink() {
  return (
    <Link href="/dashboard" className="inline-flex">
      <Brand />
    </Link>
  );
}
