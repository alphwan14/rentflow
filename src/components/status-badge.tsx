import { TONE_CLASSES, type StatusView } from "@/lib/ledger/present";

export function StatusBadge({ status }: { status: StatusView }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TONE_CLASSES[status.tone]}`}
    >
      {status.label}
    </span>
  );
}
