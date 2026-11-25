import Link from "next/link";
import { cx } from "@/ui";

/** Building switcher pills for the home screen ("All buildings" + each building). */
export function BuildingFilter({ buildings, active }: { buildings: { id: string; name: string }[]; active: string | null }) {
  const items = [{ id: null as string | null, name: "All buildings" }, ...buildings];
  return (
    <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      {items.map((b) => (
        <Link
          key={b.id ?? "all"}
          href={b.id ? `/home?b=${b.id}` : "/home"}
          className={cx(
            "flex h-8 shrink-0 items-center rounded-full px-3.5 text-[13px] font-medium whitespace-nowrap",
            active === b.id ? "bg-ink text-white" : "bg-card text-ink-2 border border-line/70 hover:text-ink",
          )}
        >
          {b.name}
        </Link>
      ))}
    </div>
  );
}
