import Link from "next/link";
import { cx } from "@/ui";

/** Pills to switch building (shown only when there is more than one). */
export function BuildingSwitcher({ base, buildings, active, all = true }: { base: string; buildings: { id: string; name: string }[]; active: string | null; all?: boolean }) {
  if (buildings.length < 2) return null;
  const items = [...(all ? [{ id: null as string | null, name: "All buildings" }] : []), ...buildings];
  return (
    <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      {items.map((b) => (
        <Link
          key={b.id ?? "all"}
          href={b.id ? `${base}?b=${b.id}` : base}
          className={cx(
            "flex h-11 shrink-0 items-center rounded-full border px-4 text-[15px] whitespace-nowrap",
            active === b.id ? "border-ink bg-ink text-white" : "border-line bg-card hover:border-line-strong",
          )}
        >
          {b.name}
        </Link>
      ))}
    </div>
  );
}
