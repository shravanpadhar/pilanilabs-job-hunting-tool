import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { ResumeData } from "@/lib/resume/schema";

/**
 * ATS-friendly PDF: single column, built-in Helvetica (real text, not images), standard headings,
 * no tables / icons / graphics, so every parser can extract the text in reading order.
 */
const s = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 36, paddingHorizontal: 42, fontFamily: "Helvetica", fontSize: 9.5, lineHeight: 1.35, color: "#111111" },
  name: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 6 },
  contact: { fontSize: 9, color: "#333333", marginBottom: 6, lineHeight: 1.5 },
  heading: { fontSize: 10.5, fontFamily: "Helvetica-Bold", marginTop: 8, marginBottom: 3, paddingBottom: 1.5, borderBottomWidth: 0.75, borderBottomColor: "#333333", letterSpacing: 0.6 },
  row: { flexDirection: "row", justifyContent: "space-between" },
  bold: { fontFamily: "Helvetica-Bold" },
  muted: { color: "#444444" },
  entry: { marginBottom: 5 },
  bullet: { flexDirection: "row", paddingLeft: 8, marginTop: 1 },
  bulletDot: { width: 9 },
  bulletText: { flex: 1 },
});

const dates = (start?: string | null, end?: string | null) => [start, end].filter(Boolean).join(" – ");

function Bullets({ items }: { items: string[] }) {
  return (
    <>
      {items.map((b, i) => (
        <View key={i} style={s.bullet} wrap={false}>
          <Text style={s.bulletDot}>•</Text>
          <Text style={s.bulletText}>{b}</Text>
        </View>
      ))}
    </>
  );
}

export function ResumePdf({ data }: { data: ResumeData }) {
  const c = data.contact;
  const contactLine = [c.email, c.phone, c.location, ...c.links.map((l) => l.url.replace(/^https?:\/\/(www\.)?/, ""))].filter(Boolean).join("  |  ");
  const skillRows: Array<[string, string[]]> = [
    ["Technical", data.skills.technical],
    ["Tools", data.skills.tools],
    ["Professional", data.skills.soft],
  ];
  return (
    <Document title={`${c.name ?? "Resume"} - Resume`} author={c.name ?? undefined}>
      <Page size="A4" style={s.page}>
        {c.name ? <Text style={s.name}>{c.name}</Text> : null}
        {contactLine ? <Text style={s.contact}>{contactLine}</Text> : null}

        {data.summary ? (
          <View>
            <Text style={s.heading}>SUMMARY</Text>
            <Text>{data.summary}</Text>
          </View>
        ) : null}

        {skillRows.some(([, v]) => v.length) ? (
          <View>
            <Text style={s.heading}>SKILLS</Text>
            {skillRows.filter(([, v]) => v.length).map(([label, v]) => (
              <Text key={label}>
                <Text style={s.bold}>{label}: </Text>
                {v.join(", ")}
              </Text>
            ))}
          </View>
        ) : null}

        {data.experience.length ? (
          <View>
            <Text style={s.heading}>EXPERIENCE</Text>
            {data.experience.map((e, i) => (
              <View key={i} style={s.entry}>
                <View style={s.row} wrap={false}>
                  <Text style={s.bold}>
                    {e.title}
                    <Text style={s.muted}>
                      {" — "}
                      {e.company}
                      {e.location ? `, ${e.location}` : ""}
                    </Text>
                  </Text>
                  <Text style={s.muted}>{dates(e.start, e.end)}</Text>
                </View>
                <Bullets items={e.bullets} />
              </View>
            ))}
          </View>
        ) : null}

        {data.projects.length ? (
          <View>
            <Text style={s.heading}>PROJECTS</Text>
            {data.projects.map((p, i) => (
              <View key={i} style={s.entry}>
                <Text style={s.bold}>
                  {p.name}
                  {p.tech.length ? <Text style={s.muted}>{`  (${p.tech.join(", ")})`}</Text> : null}
                </Text>
                {p.description ? <Text>{p.description}</Text> : null}
                <Bullets items={p.bullets} />
              </View>
            ))}
          </View>
        ) : null}

        {data.education.length ? (
          <View>
            <Text style={s.heading}>EDUCATION</Text>
            {data.education.map((e, i) => (
              <View key={i} style={s.row} wrap={false}>
                <Text>
                  <Text style={s.bold}>{[e.degree, e.field].filter(Boolean).join(", ") || e.institution}</Text>
                  {e.degree || e.field ? `, ${e.institution}` : ""}
                  {e.grade ? ` (${e.grade})` : ""}
                </Text>
                <Text style={s.muted}>{dates(e.start, e.end)}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {data.certifications.length ? (
          <View>
            <Text style={s.heading}>CERTIFICATIONS</Text>
            {data.certifications.map((cert, i) => (
              <Text key={i}>{[cert.name, cert.issuer, cert.year].filter(Boolean).join(" — ")}</Text>
            ))}
          </View>
        ) : null}
      </Page>
    </Document>
  );
}

export async function renderResumePdf(data: ResumeData): Promise<Buffer> {
  return renderToBuffer(<ResumePdf data={data} />);
}
