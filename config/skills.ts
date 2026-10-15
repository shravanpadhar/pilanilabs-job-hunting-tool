/**
 * Skill vocabulary used by the keyword matcher (stage-1 scoring), the heuristic resume
 * parser and the ATS checker. Canonical names are lowercase. `aliases` map alternative
 * spellings to the canonical skill.
 */
const SKILL_GROUPS: Record<string, string[]> = {
  languages: [
    "javascript", "typescript", "python", "java", "kotlin", "swift", "go", "rust", "c++", "c#", "c", "php",
    "ruby", "scala", "r", "sql", "bash", "dart", "objective-c", "matlab", "perl", "solidity",
  ],
  frontend: [
    "react", "next.js", "vue", "angular", "svelte", "redux", "tailwind css", "html", "css", "sass", "webpack",
    "vite", "jquery", "react native", "flutter", "storybook", "web accessibility",
  ],
  backend: [
    "node.js", "express", "nestjs", "django", "flask", "fastapi", "spring boot", "spring", ".net", "asp.net",
    "laravel", "rails", "graphql", "rest api", "grpc", "microservices", "kafka", "rabbitmq", "celery",
  ],
  data: [
    "postgresql", "mysql", "mongodb", "redis", "elasticsearch", "dynamodb", "cassandra", "snowflake", "bigquery",
    "redshift", "databricks", "spark", "hadoop", "airflow", "dbt", "etl", "data modeling", "data warehouse",
    "pandas", "numpy", "power bi", "tableau", "looker", "excel", "google analytics", "mixpanel", "amplitude",
  ],
  ml: [
    "machine learning", "deep learning", "nlp", "computer vision", "pytorch", "tensorflow", "scikit-learn",
    "llm", "prompt engineering", "mlops", "generative ai", "langchain", "rag", "statistics", "a/b testing",
  ],
  cloud: [
    "aws", "azure", "gcp", "docker", "kubernetes", "terraform", "ansible", "jenkins", "github actions", "ci/cd",
    "linux", "nginx", "prometheus", "grafana", "datadog", "serverless", "devops", "sre", "cloudformation",
  ],
  qa: ["selenium", "cypress", "playwright", "jest", "pytest", "junit", "test automation", "manual testing", "postman"],
  product: [
    "product management", "product strategy", "roadmapping", "user research", "okrs", "agile", "scrum", "kanban",
    "jira", "confluence", "prd", "stakeholder management", "go-to-market", "product analytics", "backlog grooming",
    "customer discovery", "pricing", "growth",
  ],
  design: [
    "figma", "sketch", "adobe xd", "photoshop", "illustrator", "ux design", "ui design", "wireframing",
    "prototyping", "design systems", "usability testing", "interaction design", "motion design", "after effects",
    "information architecture", "user flows",
  ],
  marketing: [
    "seo", "sem", "content marketing", "email marketing", "social media marketing", "performance marketing",
    "google ads", "facebook ads", "meta ads", "copywriting", "hubspot", "marketo", "brand strategy",
    "marketing automation", "crm", "salesforce", "lead generation", "influencer marketing", "campaign management",
    "market research", "affiliate marketing", "cro",
  ],
  operations: [
    "operations management", "supply chain", "logistics", "process improvement", "six sigma", "lean",
    "vendor management", "procurement", "budgeting", "forecasting", "project management", "pmp", "sap",
    "erp", "inventory management", "customer success", "customer support", "sales", "business development",
    "account management", "negotiation", "recruitment", "talent acquisition", "hr operations", "payroll",
    "financial modeling", "accounting", "tally", "gst", "compliance", "risk management",
  ],
  soft: [
    "leadership", "communication", "problem solving", "teamwork", "mentoring", "presentation", "collaboration",
    "time management", "critical thinking", "analytical skills",
  ],
};

export const SKILL_ALIASES: Record<string, string> = {
  js: "javascript", ecmascript: "javascript", ts: "typescript", py: "python", golang: "go",
  reactjs: "react", "react.js": "react", nextjs: "next.js", next: "next.js", vuejs: "vue", "vue.js": "vue",
  angularjs: "angular", node: "node.js", nodejs: "node.js", expressjs: "express", "express.js": "express",
  nest: "nestjs", "nest.js": "nestjs", postgres: "postgresql", psql: "postgresql", mongo: "mongodb",
  k8s: "kubernetes", "amazon web services": "aws", "google cloud": "gcp", "google cloud platform": "gcp",
  "microsoft azure": "azure", ml: "machine learning", "natural language processing": "nlp",
  "large language models": "llm", "large language model": "llm", genai: "generative ai", "gen ai": "generative ai",
  "ci cd": "ci/cd", cicd: "ci/cd", "rest apis": "rest api", restful: "rest api", "restful apis": "rest api",
  tailwind: "tailwind css", tailwindcss: "tailwind css", "springboot": "spring boot", dotnet: ".net", "dot net": ".net",
  "ruby on rails": "rails", ror: "rails", "power-bi": "power bi", powerbi: "power bi", ga4: "google analytics",
  "search engine optimization": "seo", "search engine marketing": "sem", ppc: "performance marketing",
  "ui/ux": "ux design", ux: "ux design", ui: "ui design", "user experience": "ux design", "user interface": "ui design",
  "a/b test": "a/b testing", "ab testing": "a/b testing", "product mgmt": "product management",
  "project mgmt": "project management", "go to market": "go-to-market", gtm: "go-to-market",
  "objectives and key results": "okrs", okr: "okrs", "design system": "design systems", "unit testing": "jest",
  "cloud formation": "cloudformation", "github action": "github actions", "business dev": "business development",
  "customer service": "customer support", "talent acq": "talent acquisition",
};

export const SKILLS: string[] = Array.from(new Set(Object.values(SKILL_GROUPS).flat()));
export const SOFT_SKILLS = new Set(SKILL_GROUPS.soft);

/** Skills whose names are ambiguous English words / single letters: match case-sensitively as tokens only. */
export const AMBIGUOUS_SKILLS = new Set(["c", "r", "go", "spring", "lean", "growth", "sales", "pricing", "excel", "express", "rag", "swift"]);

/** Common seniority words found in titles → rank for experience-fit logic. */
export const SENIORITY_ORDER = ["intern", "entry", "junior", "mid", "senior", "lead", "principal", "manager", "director", "executive"] as const;

export const ROLE_SYNONYMS: Record<string, string[]> = {
  "software engineer": ["software developer", "sde", "programmer", "swe", "full stack developer", "backend engineer", "frontend engineer"],
  "frontend engineer": ["front end developer", "frontend developer", "ui engineer", "react developer"],
  "backend engineer": ["back end developer", "backend developer", "server engineer", "api engineer"],
  "data scientist": ["ml engineer", "machine learning engineer", "applied scientist", "data science"],
  "data analyst": ["business analyst", "bi analyst", "analytics", "insights analyst"],
  "product manager": ["product owner", "apm", "associate product manager", "product lead"],
  "product designer": ["ux designer", "ui designer", "ui/ux designer", "interaction designer", "visual designer"],
  "devops engineer": ["sre", "site reliability engineer", "platform engineer", "cloud engineer", "infrastructure engineer"],
  "qa engineer": ["test engineer", "sdet", "quality engineer", "automation tester"],
  "digital marketing manager": ["performance marketer", "growth marketer", "marketing manager", "seo specialist", "content marketer"],
  "operations manager": ["business operations", "ops manager", "program manager", "operations lead"],
};
