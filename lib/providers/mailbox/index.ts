import { env } from "@/lib/env";
import { FakeMailbox } from "@/lib/providers/mailbox/fake";
import { GmailMailbox } from "@/lib/providers/mailbox/gmail";
import type { MailboxProvider } from "@/lib/providers/mailbox/types";

let override: MailboxProvider | null = null;
export function setMailboxForTests(p: MailboxProvider | null) {
  override = p;
}

/** Gmail when Google OAuth is configured, otherwise the in-memory fake (see MAILBOX_PROVIDER). Outlook slots in here later. */
export function getMailbox(): MailboxProvider {
  if (override) return override;
  return env.mailboxProvider === "gmail" ? new GmailMailbox() : new FakeMailbox();
}

export type { MailboxProvider };
