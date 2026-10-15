import type { NormalizedJob } from "../lib/sources/types";
import { plainToHtml } from "../lib/sources/normalize";

/**
 * Sample jobs so the app is usable without any API keys. Companies are FICTIONAL and apply links
 * point at example.com — nothing here is a real posting. Real data comes from `npm run fetch-jobs`.
 */
interface Spec {
  title: string;
  company: string;
  location: string;
  remote?: boolean;
  type?: "FULL_TIME" | "CONTRACT" | "INTERNSHIP";
  skills: string[];
  years: number;
  summary: string;
  salary?: [number, number]; // INR per year
  direct?: boolean;
  age: number; // days since posted
}

const SPECS: Spec[] = [
  { title: "Senior Frontend Engineer (React)", company: "Northwind Labs", location: "Bengaluru, India", skills: ["React", "TypeScript", "Next.js", "Tailwind CSS", "Jest", "GraphQL"], years: 5, summary: "Build the customer dashboard used by thousands of finance teams.", salary: [3000000, 4500000], age: 1 },
  { title: "Frontend Developer", company: "Bluefin Retail", location: "Pune, India", skills: ["JavaScript", "React", "HTML", "CSS", "Redux", "REST API"], years: 2, summary: "Own storefront features across web and mobile web.", salary: [900000, 1600000], age: 2 },
  { title: "Backend Engineer (Node.js)", company: "Cobalt Payments", location: "Bengaluru, India", skills: ["Node.js", "TypeScript", "PostgreSQL", "Redis", "AWS", "Microservices", "Kafka"], years: 4, summary: "Design payment APIs that handle millions of transactions a day.", salary: [2200000, 3600000], age: 0 },
  { title: "Backend Developer (Python)", company: "Terrace Health", location: "Hyderabad, India", skills: ["Python", "Django", "PostgreSQL", "Docker", "Celery", "REST API"], years: 3, summary: "Build scheduling and records services for a digital clinic network.", salary: [1500000, 2600000], age: 3 },
  { title: "Full Stack Engineer", company: "Lumen Education", location: "Remote – India", remote: true, skills: ["React", "Node.js", "TypeScript", "MongoDB", "AWS", "Docker"], years: 3, summary: "Ship learner-facing features end to end in a small remote team.", salary: [1800000, 3000000], age: 1 },
  { title: "Data Analyst", company: "Orchid Logistics", location: "Mumbai, India", skills: ["SQL", "Excel", "Tableau", "Python", "Power BI", "A/B testing"], years: 2, summary: "Turn shipment data into decisions for operations leaders.", salary: [800000, 1500000], age: 2 },
  { title: "Senior Data Scientist", company: "Quill Analytics", location: "Bengaluru, India", skills: ["Python", "Machine Learning", "SQL", "PyTorch", "Statistics", "MLOps", "Airflow"], years: 5, summary: "Lead forecasting and recommendation models for retail clients.", salary: [3200000, 5200000], age: 4 },
  { title: "Machine Learning Engineer", company: "Vantage AI", location: "Remote – Worldwide", remote: true, skills: ["Python", "PyTorch", "LLM", "RAG", "Docker", "AWS", "MLOps"], years: 3, summary: "Productionise language-model features used by enterprise customers.", salary: [3000000, 5500000], age: 2 },
  { title: "DevOps Engineer", company: "Granite Cloud", location: "Pune, India", skills: ["AWS", "Kubernetes", "Terraform", "Docker", "CI/CD", "Linux", "Prometheus"], years: 4, summary: "Run a multi-region platform with strong reliability targets.", salary: [2000000, 3400000], age: 5 },
  { title: "Site Reliability Engineer", company: "Meridian Streaming", location: "Remote – India", remote: true, skills: ["Kubernetes", "Go", "Prometheus", "Grafana", "AWS", "Terraform", "SRE"], years: 5, summary: "Keep live video running for millions of concurrent viewers.", salary: [3000000, 4800000], age: 1 },
  { title: "Android Developer", company: "Saffron Mobility", location: "Bengaluru, India", skills: ["Kotlin", "Android", "REST API", "Jetpack", "Git"], years: 3, summary: "Build the rider app for a ride-sharing platform.", salary: [1600000, 2800000], age: 6 },
  { title: "Flutter Developer", company: "Paperplane Studio", location: "Delhi NCR, India", skills: ["Flutter", "Dart", "Firebase", "REST API", "Git"], years: 2, summary: "Create cross-platform apps for consumer startups.", salary: [900000, 1700000], age: 3 },
  { title: "QA Automation Engineer", company: "Brightpath Software", location: "Chennai, India", skills: ["Selenium", "Cypress", "Java", "Test automation", "Postman", "CI/CD"], years: 3, summary: "Own automated regression suites for a SaaS product.", salary: [1000000, 1900000], age: 4 },
  { title: "Product Manager", company: "Cobalt Payments", location: "Bengaluru, India", skills: ["Product management", "Roadmapping", "User research", "SQL", "Stakeholder management", "OKRs"], years: 4, summary: "Define the roadmap for merchant onboarding.", salary: [2800000, 4500000], age: 2 },
  { title: "Associate Product Manager", company: "Lumen Education", location: "Remote – India", remote: true, skills: ["Product management", "User research", "Agile", "Jira", "Product analytics"], years: 1, summary: "Learn and grow in a rotational APM programme.", salary: [1200000, 1900000], age: 3 },
  { title: "Senior Product Manager – Growth", company: "Northwind Labs", location: "Bengaluru, India", skills: ["Product management", "Growth", "A/B testing", "SQL", "Mixpanel", "Go-to-market"], years: 6, summary: "Lead activation and retention for a B2B SaaS product.", salary: [3800000, 6000000], age: 7 },
  { title: "Product Designer (UX/UI)", company: "Paperplane Studio", location: "Mumbai, India", skills: ["Figma", "UX design", "UI design", "Prototyping", "Design systems", "User research"], years: 3, summary: "Design consumer experiences from research to polished UI.", salary: [1400000, 2400000], age: 2 },
  { title: "UI Designer", company: "Bluefin Retail", location: "Pune, India", skills: ["Figma", "Photoshop", "Illustrator", "UI design", "Wireframing"], years: 1, summary: "Create visual designs for campaigns and the storefront.", salary: [600000, 1100000], age: 8 },
  { title: "Digital Marketing Manager", company: "Orchid Logistics", location: "Mumbai, India", skills: ["SEO", "Google Ads", "Content marketing", "Email marketing", "Google Analytics", "Campaign management"], years: 5, summary: "Lead demand generation across paid and organic channels.", salary: [1800000, 3000000], age: 3 },
  { title: "Performance Marketing Specialist", company: "Saffron Mobility", location: "Bengaluru, India", skills: ["Performance marketing", "Meta Ads", "Google Ads", "A/B testing", "Excel"], years: 2, summary: "Run and optimise paid acquisition for a mobility app.", salary: [900000, 1700000], age: 1 },
  { title: "Content Marketing Writer", company: "Lumen Education", location: "Remote – India", remote: true, skills: ["Content marketing", "SEO", "Copywriting", "Social media marketing"], years: 2, summary: "Write guides and stories that help learners choose courses.", salary: [600000, 1100000], age: 5 },
  { title: "Operations Manager", company: "Orchid Logistics", location: "Delhi NCR, India", skills: ["Operations management", "Supply chain", "Vendor management", "Process improvement", "Excel", "Lean"], years: 6, summary: "Run a regional fulfilment network of 12 hubs.", salary: [1800000, 3200000], age: 2 },
  { title: "Business Operations Associate", company: "Cobalt Payments", location: "Bengaluru, India", skills: ["Operations management", "Excel", "SQL", "Stakeholder management", "Process improvement"], years: 1, summary: "Support strategy and operations projects across teams.", salary: [800000, 1400000], age: 4 },
  { title: "Customer Success Manager", company: "Quill Analytics", location: "Hyderabad, India", skills: ["Customer success", "Account management", "Salesforce", "Communication", "Stakeholder management"], years: 3, summary: "Help enterprise customers get value from analytics products.", salary: [1500000, 2500000], age: 6 },
  { title: "Business Development Executive", company: "Granite Cloud", location: "Pune, India", skills: ["Business development", "Sales", "Lead generation", "CRM", "Negotiation"], years: 2, summary: "Open new accounts for a cloud infrastructure company.", salary: [700000, 1400000], age: 3 },
  { title: "HR Operations Specialist", company: "Meridian Streaming", location: "Mumbai, India", skills: ["HR operations", "Payroll", "Recruitment", "Excel", "Compliance"], years: 3, summary: "Keep people operations running smoothly for 800 employees.", salary: [900000, 1600000], age: 9 },
  { title: "Financial Analyst", company: "Terrace Health", location: "Hyderabad, India", skills: ["Financial modeling", "Excel", "Forecasting", "Budgeting", "SQL"], years: 3, summary: "Own budgeting and forecasting for clinic operations.", salary: [1200000, 2100000], age: 5 },
  { title: "Software Engineering Intern", company: "Brightpath Software", location: "Chennai, India", type: "INTERNSHIP", skills: ["JavaScript", "React", "Git", "HTML", "CSS"], years: 0, summary: "A six-month internship with mentorship and a path to full-time.", salary: [240000, 360000], age: 2 },
  { title: "Data Analyst Intern", company: "Quill Analytics", location: "Remote – India", remote: true, type: "INTERNSHIP", skills: ["SQL", "Excel", "Python", "Tableau"], years: 0, summary: "Work with real client data alongside senior analysts.", salary: [200000, 320000], age: 4 },
  { title: "Graduate Engineer Trainee", company: "Granite Cloud", location: "Pune, India", skills: ["Java", "SQL", "Git", "Spring Boot"], years: 0, summary: "Campus hiring track: 3 months of training, then a product team.", salary: [500000, 800000], age: 6 },
  { title: "Java Backend Developer", company: "Cobalt Payments", location: "Hyderabad, India", skills: ["Java", "Spring Boot", "Microservices", "Kafka", "PostgreSQL", "Docker"], years: 4, summary: "Build resilient settlement services in Java.", salary: [2000000, 3400000], age: 1 },
  { title: ".NET Developer", company: "Bluefin Retail", location: "Chennai, India", skills: [".NET", "C#", "SQL", "Azure", "REST API"], years: 3, summary: "Modernise inventory services on Azure.", salary: [1400000, 2500000], age: 7 },
  { title: "Contract React Developer (6 months)", company: "Vantage AI", location: "Remote – Worldwide", remote: true, type: "CONTRACT", skills: ["React", "TypeScript", "Tailwind CSS", "Storybook"], years: 3, summary: "Contract engagement to deliver a new analytics UI.", salary: [2000000, 3200000], age: 2 },
  { title: "Engineering Manager", company: "Meridian Streaming", location: "Bengaluru, India", skills: ["Leadership", "Mentoring", "Microservices", "AWS", "Agile", "Stakeholder management"], years: 9, summary: "Lead two squads building the playback platform.", salary: [5000000, 8000000], age: 3 },
  // Company career-page sample jobs (shown in "Hidden jobs")
  { title: "Staff Backend Engineer", company: "Aurora Robotics", location: "Bengaluru, India", skills: ["Go", "Kubernetes", "PostgreSQL", "gRPC", "AWS"], years: 8, summary: "Posted only on our careers page.", salary: [5000000, 7500000], direct: true, age: 1 },
  { title: "Product Designer", company: "Aurora Robotics", location: "Remote – India", remote: true, skills: ["Figma", "Design systems", "UX design", "Prototyping"], years: 4, summary: "Posted only on our careers page.", salary: [2200000, 3600000], direct: true, age: 2 },
  { title: "Data Engineer", company: "Pinecone Fintech", location: "Mumbai, India", skills: ["Python", "SQL", "Airflow", "dbt", "Snowflake", "AWS"], years: 4, summary: "Posted only on our careers page.", salary: [2400000, 3800000], direct: true, age: 0 },
  { title: "Growth Marketing Lead", company: "Pinecone Fintech", location: "Delhi NCR, India", skills: ["Growth", "Performance marketing", "SEO", "Google Analytics", "Leadership"], years: 7, summary: "Posted only on our careers page.", salary: [3000000, 4800000], direct: true, age: 3 },
  { title: "Frontend Engineer", company: "Aurora Robotics", location: "Pune, India", skills: ["React", "TypeScript", "Next.js", "GraphQL"], years: 3, summary: "Posted only on our careers page.", salary: [1800000, 3000000], direct: true, age: 5 },
];

const DEPT_OPENERS = [
  "About the role",
  "We're a fast-growing team and this role is a chance to make a visible impact from week one.",
];

export function buildSeedJobs(now = new Date()): NormalizedJob[] {
  return SPECS.map((s, i) => {
    const skillsLine = s.skills.join(", ");
    const text = [
      `${DEPT_OPENERS[0]}`,
      `${s.summary} ${DEPT_OPENERS[1]}`,
      "What you'll do",
      `• Work closely with product, design and engineering partners on ${s.title.toLowerCase()} priorities.\n• Own outcomes end to end, from discovery to launch and iteration.\n• Share knowledge and raise the bar for the team.`,
      "What we're looking for",
      `• ${s.years > 0 ? `${s.years}+ years of relevant experience.` : "Fresh graduates and career starters are welcome."}\n• Hands-on experience with: ${skillsLine}.\n• Clear communication and a bias for action.`,
      "Sample data: this is a fictional posting generated by the seed script so the app can be explored without API keys.",
    ].join("\n\n");
    return {
      source: "seed",
      externalId: `seed-${i + 1}`,
      title: s.title,
      company: s.company,
      companyLogoUrl: null,
      location: s.location,
      country: "in",
      isRemote: Boolean(s.remote),
      employmentType: s.type ?? "FULL_TIME",
      salaryMin: s.salary?.[0] ?? null,
      salaryMax: s.salary?.[1] ?? null,
      salaryCurrency: s.salary ? "INR" : null,
      descriptionHtml: plainToHtml(text),
      descriptionText: text,
      postedAt: new Date(now.getTime() - s.age * 86_400_000 - (i % 7) * 3_600_000),
      applyUrl: `https://example.com/jobs/seed-${i + 1}`,
      publisher: null,
      attributionUrl: null,
      isDirect: Boolean(s.direct),
    };
  });
}
