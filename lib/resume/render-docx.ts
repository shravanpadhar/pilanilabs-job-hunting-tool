import { AlignmentType, BorderStyle, Document, Packer, Paragraph, TabStopPosition, TabStopType, TextRun } from "docx";
import type { ResumeData } from "@/lib/resume/schema";

/** ATS-friendly DOCX: one column, built-in styles, real bullets, no tables or text boxes. */
const FONT = "Calibri";
const SIZE = 20; // half-points → 10pt

const run = (text: string, opts: { bold?: boolean; size?: number; color?: string } = {}) =>
  new TextRun({ text, bold: opts.bold, size: opts.size ?? SIZE, font: FONT, color: opts.color });

const heading = (text: string) =>
  new Paragraph({
    spacing: { before: 160, after: 60 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "333333", space: 1 } },
    children: [run(text, { bold: true, size: 22 })],
  });

const bullet = (text: string) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 20 }, children: [run(text)] });

const dates = (start?: string | null, end?: string | null) => [start, end].filter(Boolean).join(" – ");

function rightTabLine(left: TextRun[], right: string) {
  return new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
    spacing: { before: 80 },
    keepNext: true,
    children: [...left, run(`\t${right}`, { color: "444444" })],
  });
}

export async function renderResumeDocx(data: ResumeData): Promise<Buffer> {
  const c = data.contact;
  const contactLine = [c.email, c.phone, c.location, ...c.links.map((l) => l.url.replace(/^https?:\/\/(www\.)?/, ""))].filter(Boolean).join("  |  ");
  const children: Paragraph[] = [];

  if (c.name) children.push(new Paragraph({ spacing: { after: 40 }, children: [run(c.name, { bold: true, size: 36 })] }));
  if (contactLine) children.push(new Paragraph({ spacing: { after: 80 }, children: [run(contactLine, { size: 18, color: "333333" })] }));

  if (data.summary) children.push(heading("SUMMARY"), new Paragraph({ children: [run(data.summary)] }));

  const skillRows: Array<[string, string[]]> = [["Technical", data.skills.technical], ["Tools", data.skills.tools], ["Professional", data.skills.soft]];
  if (skillRows.some(([, v]) => v.length)) {
    children.push(heading("SKILLS"));
    for (const [label, v] of skillRows) if (v.length) children.push(new Paragraph({ children: [run(`${label}: `, { bold: true }), run(v.join(", "))] }));
  }

  if (data.experience.length) {
    children.push(heading("EXPERIENCE"));
    for (const e of data.experience) {
      children.push(
        rightTabLine([run(e.title, { bold: true }), run(` — ${e.company}${e.location ? `, ${e.location}` : ""}`, { color: "444444" })], dates(e.start, e.end)),
        ...e.bullets.map(bullet),
      );
    }
  }

  if (data.projects.length) {
    children.push(heading("PROJECTS"));
    for (const p of data.projects) {
      children.push(new Paragraph({ spacing: { before: 80 }, keepNext: true, children: [run(p.name, { bold: true }), ...(p.tech.length ? [run(`  (${p.tech.join(", ")})`, { color: "444444" })] : [])] }));
      if (p.description) children.push(new Paragraph({ children: [run(p.description)] }));
      children.push(...p.bullets.map(bullet));
    }
  }

  if (data.education.length) {
    children.push(heading("EDUCATION"));
    for (const e of data.education) {
      const title = [e.degree, e.field].filter(Boolean).join(", ") || e.institution;
      children.push(
        rightTabLine([run(title, { bold: true }), run(`${e.degree || e.field ? `, ${e.institution}` : ""}${e.grade ? ` (${e.grade})` : ""}`)], dates(e.start, e.end)),
      );
    }
  }

  if (data.certifications.length) {
    children.push(heading("CERTIFICATIONS"));
    for (const cert of data.certifications) children.push(new Paragraph({ children: [run([cert.name, cert.issuer, cert.year].filter(Boolean).join(" — "))] }));
  }

  const doc = new Document({
    creator: c.name ?? "Pilanilabs",
    title: `${c.name ?? "Resume"} - Resume`,
    styles: { default: { document: { run: { font: FONT, size: SIZE } } } },
    sections: [
      {
        properties: { page: { margin: { top: 720, bottom: 720, left: 850, right: 850 } } },
        children: children.length ? children : [new Paragraph({ alignment: AlignmentType.LEFT, children: [run("")] })],
      },
    ],
  });
  return Packer.toBuffer(doc);
}
