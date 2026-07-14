/** "or" separator between Google and email/password on auth forms. */
export function AuthDivider() {
  return (
    <div className="flex items-center gap-3" aria-hidden="true">
      <div className="h-px flex-1 bg-slate-200" />
      <span className="text-xs uppercase tracking-wide text-slate-400">or</span>
      <div className="h-px flex-1 bg-slate-200" />
    </div>
  );
}
