import { resumeSchema, type ResumeData } from "@/lib/resume/schema";

/** A realistic parsed resume used across the unit tests. */
export const sampleResume: ResumeData = resumeSchema.parse({
  contact: { name: "Asha Verma", email: "asha.verma@example.com", phone: "+91 98765 43210", location: "Bengaluru, India", links: [{ label: "LinkedIn", url: "https://linkedin.com/in/ashaverma" }] },
  summary: "Frontend engineer with 4 years of experience building React applications for fintech products.",
  skills: {
    technical: ["JavaScript", "TypeScript", "React", "Next.js", "HTML", "CSS", "REST API"],
    tools: ["Git", "Figma", "Jest", "Docker"],
    soft: ["Communication", "Mentoring"],
  },
  experience: [
    {
      company: "Cobalt Payments",
      title: "Senior Frontend Engineer",
      location: "Bengaluru",
      start: "Jan 2022",
      end: "Present",
      bullets: [
        "Led migration of the merchant dashboard to Next.js, cutting page load time by 38%.",
        "Built a reusable component library in TypeScript used by 6 product teams.",
        "Mentored 3 junior engineers and ran weekly code reviews.",
      ],
    },
    {
      company: "Bluefin Retail",
      title: "Frontend Developer",
      location: "Pune",
      start: "Jul 2020",
      end: "Dec 2021",
      bullets: ["Developed storefront features in React and Redux serving 200k monthly users.", "Wrote Jest unit tests that raised coverage from 40% to 75%."],
    },
  ],
  education: [{ institution: "Pune Institute of Technology", degree: "B.E.", field: "Computer Engineering", start: "2016", end: "2020", grade: "8.4 CGPA" }],
  projects: [{ name: "Expense Tracker", description: "Personal finance app", tech: ["React", "Node.js"], bullets: ["Built charts for monthly spending."], url: null }],
  certifications: [{ name: "AWS Certified Cloud Practitioner", issuer: "Amazon Web Services", year: "2023" }],
  totalYearsExperience: 4.4,
  seniority: "mid",
  inferredTargetRoles: ["Frontend Engineer", "Software Engineer"],
});

export const sampleResumeText = `Asha Verma
asha.verma@example.com | +91 98765 43210 | Bengaluru, India
linkedin.com/in/ashaverma

SUMMARY
Frontend engineer with 4 years of experience building React applications for fintech products.

SKILLS
JavaScript, TypeScript, React, Next.js, HTML, CSS, REST API, Git, Figma, Jest, Docker

EXPERIENCE
Senior Frontend Engineer at Cobalt Payments    Jan 2022 - Present
• Led migration of the merchant dashboard to Next.js, cutting page load time by 38%.
• Built a reusable component library in TypeScript used by 6 product teams.
• Mentored 3 junior engineers and ran weekly code reviews.

Frontend Developer at Bluefin Retail    Jul 2020 - Dec 2021
• Developed storefront features in React and Redux serving 200k monthly users.
• Wrote Jest unit tests that raised coverage from 40% to 75%.

EDUCATION
B.E. Computer Engineering, Pune Institute of Technology    2016 - 2020

CERTIFICATIONS
AWS Certified Cloud Practitioner - 2023
`;

export const sampleJobDescription = `We are hiring a Senior Frontend Engineer to build our customer dashboard.
You will work with React, TypeScript and Next.js, write unit tests with Jest, and collaborate with designers in Figma.
Requirements: 4+ years of experience building web applications. Experience with GraphQL and Tailwind CSS is a plus.
You will mentor engineers, improve performance and own the design system.`;
