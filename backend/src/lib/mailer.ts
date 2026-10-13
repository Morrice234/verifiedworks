// Email delivery. There is no provider wired in yet, so every email is "simulated":
// printed to the server console and handed back to the caller so the app can show it.
// To send real email, replace the body of deliver() with your provider's API call
// (Resend, SendGrid, Postmark, Amazon SES or nodemailer over SMTP).

export type OutgoingEmail = { to: string; subject: string; text: string };
export type DeliveryResult = { delivered: boolean; simulated: boolean; email: OutgoingEmail };

async function deliver(email: OutgoingEmail): Promise<DeliveryResult> {
  console.log(
    [
      "",
      "[simulated email]",
      `To:      ${email.to}`,
      `Subject: ${email.subject}`,
      "",
      email.text,
      "",
    ].join("\n"),
  );
  return { delivered: false, simulated: true, email };
}

/** Tells a user the admin has given their account access. */
export function sendAccessEmail(opts: { to: string; username: string; code: string; expiresAt: Date | null }) {
  const until = opts.expiresAt
    ? `It is valid until ${opts.expiresAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}.`
    : "It gives you lifetime access.";
  const lines = [
    `Hi ${opts.username},`,
    "",
    "Your VerifiedWorks account has been unlocked. Your access key is:",
    "",
    `    ${opts.code}`,
    "",
    until,
    "There's nothing to enter in the app. Open it, or tap Check again if it's already open.",
    "",
    "The VerifiedWorks team",
  ];
  return deliver({ to: opts.to, subject: "Your VerifiedWorks access is ready", text: lines.join("\n") });
}
