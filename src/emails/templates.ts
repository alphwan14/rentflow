/**
 * Plain-style emails. One message, one button, no images.
 * The sign-up confirmation is a Supabase Auth template (supabase/templates/confirm.html)
 * sent through Resend SMTP; the invite email is sent from the app through the Resend API.
 */
const ROLE: Record<string, string> = {
  owner: "an owner",
  manager: "a manager",
  caretaker: "the caretaker",
  viewer: "a viewer",
};

function layout(title: string, paragraphs: string[], button: { label: string; url: string }, footer: string): string {
  const p = paragraphs.map((t) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#0F1115">${t}</p>`).join("");
  return `<!doctype html><html><body style="margin:0;background:#F6F7F9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F7F9;padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px">
<tr><td style="padding:0 0 16px;font-size:17px;font-weight:600;color:#0F1115">RentFlow</td></tr>
<tr><td style="background:#FFFFFF;border:1px solid #E8EAEE;border-radius:16px;padding:24px">
<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#0F1115">${title}</h1>
${p}
<a href="${button.url}" style="display:inline-block;background:#0E7A4F;color:#FFFFFF;text-decoration:none;font-size:15px;font-weight:500;padding:12px 20px;border-radius:12px">${button.label}</a>
</td></tr>
<tr><td style="padding:16px 0 0;font-size:13px;line-height:1.5;color:#6B7280">${footer}</td></tr>
</table></td></tr></table></body></html>`;
}

export function inviteEmail(p: { orgName: string; inviterName: string | null; role: string; link: string }) {
  const who = p.inviterName ? `${p.inviterName} has` : "You've been";
  const subject = `Join ${p.orgName} on RentFlow`;
  const lead = `${p.inviterName ? who + " invited you" : "You've been invited"} to help with rent for ${p.orgName} as ${ROLE[p.role] ?? "a member"}.`;
  return {
    subject,
    html: layout(
      subject,
      [lead, "RentFlow shows who has paid rent and who hasn't. Open the link below to join. It works once and expires in 7 days."],
      { label: "Join on RentFlow", url: p.link },
      "If you weren't expecting this, you can ignore this email.",
    ),
    text: `${lead}\n\nOpen this link to join (it works once and expires in 7 days):\n${p.link}\n\nIf you weren't expecting this, you can ignore this email.`,
  };
}
