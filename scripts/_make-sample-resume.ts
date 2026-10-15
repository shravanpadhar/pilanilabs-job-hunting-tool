import { writeFileSync } from "node:fs";
import { renderResumeDocx } from "../lib/resume/render-docx";
import { renderResumePdf } from "../lib/resume/render-pdf";
import { sampleResume } from "../tests/unit/fixtures";

const out = process.argv[2] ?? ".";
Promise.all([renderResumePdf(sampleResume), renderResumeDocx(sampleResume)]).then(([pdf, docx]) => {
  writeFileSync(`${out}/sample-resume.pdf`, pdf);
  writeFileSync(`${out}/sample-resume.docx`, docx);
  console.log("written", pdf.length, docx.length);
});
