import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-4xl font-semibold">Privacy</h1>
      <p className="text-muted-foreground">
        Plain-language summary of what Pilanilabs Job Hunting Tool stores and why. This is a product summary, not legal advice — have counsel review it before you launch publicly.
      </p>

      {[
        ["What we store", "Your email address; the resume files you upload (in a private storage bucket, opened only through short-lived signed links); the text extracted from them; the structured profile (skills, experience, education) you review; your job preferences; the jobs you save and your notes; tailored resumes and cover letters; saved searches and alert settings; and anonymous-to-others reviews you choose to write."],
        ["How your resume is used", "To rank jobs for you, to tailor resumes and cover letters, to check ATS readiness and to draft networking messages. Resume text is sent to Anthropic's Claude API for parsing, scoring and drafting. We do not use your resume to train models, and we never sell it or share it with employers or other users. Tailoring never adds facts that aren't in your resume."],
        ["What we never do", "We never apply to jobs on your behalf, never log in to LinkedIn or any job site as you, never message anyone for you, and never scrape websites that forbid it. Referral and cover-letter drafts are for you to review and send yourself."],
        ["Job data", "Jobs come from public APIs and company career pages (Google for Jobs via JSearch, Adzuna, Remotive, Remote OK, Arbeitnow, Jobicy, Greenhouse, Lever, Ashby). Each job links back to its original posting and names its source."],
        ["Alerts", "If you turn on email or WhatsApp alerts, we use your email address or WhatsApp number only to send the digests you asked for, through Resend and Twilio. You can switch alerts off at any time on the Saved searches page."],
        ["Your controls", "In Settings you can download all your data as JSON, delete individual resumes, or delete your account — which permanently removes your files, database records and sign-in."],
        ["Security", "Row Level Security is enabled in the database so users can only read their own records; resume files are private; AI keys never reach your browser; uploads are validated by file signature, not just file name."],
      ].map(([h, p]) => (
        <section key={h} className="space-y-1.5">
          <h2 className="text-2xl font-semibold">{h}</h2>
          <p>{p}</p>
        </section>
      ))}

      <p className="text-sm text-muted-foreground">
        Questions? Contact the team at <a className="underline" href="https://www.pilanilabs.com">pilanilabs.com</a>. <Link href="/" className="underline">Back to home</Link>
      </p>
    </article>
  );
}
