import type { ResumeDiff } from "@/lib/resume/diff";
import type { ResumeData } from "@/lib/resume/schema";
import { cn } from "@/lib/utils";

const dates = (s?: string | null, e?: string | null) => [s, e].filter(Boolean).join(" – ");

const key = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

function H({ children }: { children: React.ReactNode }) {
  return <h4 className="mb-1 mt-4 border-b border-foreground/60 pb-0.5 font-sans text-[0.8rem] font-bold uppercase tracking-wider">{children}</h4>;
}

/** Read-only, ATS-style rendering of a resume. With `diff`, rewritten bullets and summary are highlighted. */
export function ResumePreview({ data, diff, className }: { data: ResumeData; diff?: ResumeDiff; className?: string }) {
  const c = data.contact;
  const hl = (text: string) => (diff && diff.changedBullets.has(text) ? "rounded-sm bg-primary/15 px-1 -mx-1 border-l-2 border-primary" : "");
  void key;
  const skillRows: Array<[string, string[]]> = [["Technical", data.skills.technical], ["Tools", data.skills.tools], ["Professional", data.skills.soft]];
  return (
    <article className={cn("rounded-card border bg-white p-5 text-[0.85rem] leading-relaxed text-[#111] shadow-sm sm:p-7", className)} aria-label="Resume preview">
      {c.name ? <h3 className="font-sans text-2xl font-bold">{c.name}</h3> : null}
      <p className="text-[0.8rem] text-[#333]">{[c.email, c.phone, c.location, ...c.links.map((l) => l.url.replace(/^https?:\/\/(www\.)?/, ""))].filter(Boolean).join("  |  ")}</p>

      {data.summary ? (
        <>
          <H>Summary</H>
          <p className={cn(diff?.summaryChanged && "rounded-sm border-l-2 border-primary bg-primary/15 px-1 -mx-1")}>{data.summary}</p>
        </>
      ) : null}

      {skillRows.some(([, v]) => v.length) ? (
        <>
          <H>Skills</H>
          {skillRows.filter(([, v]) => v.length).map(([label, v]) => (
            <p key={label}>
              <strong>{label}:</strong> {v.join(", ")}
            </p>
          ))}
        </>
      ) : null}

      {data.experience.length ? (
        <>
          <H>Experience</H>
          {data.experience.map((e, i) => (
            <div key={i} className="mb-2">
              <div className="flex flex-wrap justify-between gap-x-3">
                <p>
                  <strong>{e.title}</strong> — {e.company}
                  {e.location ? `, ${e.location}` : ""}
                </p>
                <p className="text-[#444]">{dates(e.start, e.end)}</p>
              </div>
              <ul className="ml-4 list-disc">
                {e.bullets.map((b, j) => (
                  <li key={j} className={hl(b)}>{b}</li>
                ))}
              </ul>
            </div>
          ))}
        </>
      ) : null}

      {data.projects.length ? (
        <>
          <H>Projects</H>
          {data.projects.map((p, i) => (
            <div key={i} className="mb-2">
              <p>
                <strong>{p.name}</strong>
                {p.tech.length ? <span className="text-[#444]"> ({p.tech.join(", ")})</span> : null}
              </p>
              {p.description ? <p>{p.description}</p> : null}
              <ul className="ml-4 list-disc">
                {p.bullets.map((b, j) => (
                  <li key={j} className={hl(b)}>{b}</li>
                ))}
              </ul>
            </div>
          ))}
        </>
      ) : null}

      {data.education.length ? (
        <>
          <H>Education</H>
          {data.education.map((e, i) => (
            <div key={i} className="flex flex-wrap justify-between gap-x-3">
              <p>
                <strong>{[e.degree, e.field].filter(Boolean).join(", ") || e.institution}</strong>
                {e.degree || e.field ? `, ${e.institution}` : ""}
                {e.grade ? ` (${e.grade})` : ""}
              </p>
              <p className="text-[#444]">{dates(e.start, e.end)}</p>
            </div>
          ))}
        </>
      ) : null}

      {data.certifications.length ? (
        <>
          <H>Certifications</H>
          {data.certifications.map((cert, i) => (
            <p key={i}>{[cert.name, cert.issuer, cert.year].filter(Boolean).join(" — ")}</p>
          ))}
        </>
      ) : null}
    </article>
  );
}
