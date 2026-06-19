import type { ComponentProps, ReactNode } from "react";

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-slate-400">{hint}</span> : null}
    </label>
  );
}

export function Input(props: ComponentProps<"input">) {
  const { className = "", ...rest } = props;
  return (
    <input
      {...rest}
      className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 ${className}`}
    />
  );
}

export function Select(props: ComponentProps<"select">) {
  const { className = "", children, ...rest } = props;
  return (
    <select
      {...rest}
      className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 ${className}`}
    >
      {children}
    </select>
  );
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: "primary" | "ghost" | "danger" }) {
  const styles = {
    primary: "bg-brand text-brand-fg hover:bg-teal-800",
    ghost: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
    danger: "border border-red-200 bg-white text-red-600 hover:bg-red-50",
  }[variant];
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:opacity-60 ${styles} ${className}`}
    />
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
      {children}
    </p>
  );
}
