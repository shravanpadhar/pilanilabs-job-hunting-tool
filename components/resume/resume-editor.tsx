"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/label";
import { Input, Textarea } from "@/components/ui/input";
import { TextListField } from "@/components/resume/text-list-field";
import type { ResumeData } from "@/lib/resume/schema";

type R = ResumeData;

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <fieldset className="space-y-4 rounded-card border bg-card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <legend className="font-heading text-xl font-semibold">{title}</legend>
        {action}
      </div>
      {children}
    </fieldset>
  );
}

const nullable = (s: string) => (s.trim() === "" ? null : s);

function move<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const copy = [...arr];
  [copy[i], copy[j]] = [copy[j], copy[i]];
  return copy;
}

function RowTools({ i, length, onMove, onRemove, label }: { i: number; length: number; onMove: (d: -1 | 1) => void; onRemove: () => void; label: string }) {
  return (
    <div className="flex gap-1">
      <Button type="button" variant="ghost" size="icon" className="size-9" aria-label={`Move ${label} up`} disabled={i === 0} onClick={() => onMove(-1)}>
        <ArrowUp />
      </Button>
      <Button type="button" variant="ghost" size="icon" className="size-9" aria-label={`Move ${label} down`} disabled={i === length - 1} onClick={() => onMove(1)}>
        <ArrowDown />
      </Button>
      <Button type="button" variant="ghost" size="icon" className="size-9 text-danger" aria-label={`Remove ${label}`} onClick={onRemove}>
        <Trash2 />
      </Button>
    </div>
  );
}

/**
 * Full resume editor. Used to review the parsed profile and to edit a tailored resume.
 * Remount it (change `version`) after replacing `value` from outside.
 */
export function ResumeEditor({ value, onChange, version = 0, idPrefix = "re" }: { value: R; onChange: (next: R) => void; version?: number; idPrefix?: string }) {
  const set = <K extends keyof R>(key: K, v: R[K]) => onChange({ ...value, [key]: v });
  const id = (s: string) => `${idPrefix}-${s}`;

  return (
    <div className="space-y-5" key={version}>
      <Section title="Contact">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor={id("name")}>
            <Input id={id("name")} value={value.contact.name ?? ""} onChange={(e) => set("contact", { ...value.contact, name: nullable(e.target.value) })} />
          </Field>
          <Field label="Email" htmlFor={id("email")}>
            <Input id={id("email")} type="email" value={value.contact.email ?? ""} onChange={(e) => set("contact", { ...value.contact, email: nullable(e.target.value) })} />
          </Field>
          <Field label="Phone" htmlFor={id("phone")}>
            <Input id={id("phone")} type="tel" value={value.contact.phone ?? ""} onChange={(e) => set("contact", { ...value.contact, phone: nullable(e.target.value) })} />
          </Field>
          <Field label="Location" htmlFor={id("location")}>
            <Input id={id("location")} value={value.contact.location ?? ""} onChange={(e) => set("contact", { ...value.contact, location: nullable(e.target.value) })} />
          </Field>
        </div>
        <Field label="Links (one per line: label | url)" htmlFor={id("links")} hint="For example: LinkedIn | linkedin.com/in/yourname">
          <TextListField
            id={id("links")}
            rows={2}
            value={value.contact.links.map((l) => `${l.label} | ${l.url}`)}
            onChange={(lines) =>
              set("contact", {
                ...value.contact,
                links: lines.map((l) => {
                  const [label, ...rest] = l.split("|");
                  return rest.length ? { label: label.trim(), url: rest.join("|").trim() } : { label: "Link", url: l.trim() };
                }),
              })
            }
          />
        </Field>
      </Section>

      <Section title="Summary">
        <Textarea id={id("summary")} aria-label="Summary" rows={4} value={value.summary ?? ""} onChange={(e) => set("summary", nullable(e.target.value))} />
      </Section>

      <Section title="Skills">
        {(
          [
            ["technical", "Technical skills"],
            ["tools", "Tools & platforms"],
            ["soft", "Professional skills"],
          ] as const
        ).map(([k, label]) => (
          <Field key={k} label={`${label} (comma separated)`} htmlFor={id(`skills-${k}`)}>
            <TextListField id={id(`skills-${k}`)} mode="commas" value={value.skills[k]} onChange={(v) => set("skills", { ...value.skills, [k]: v })} />
          </Field>
        ))}
      </Section>

      <Section
        title="Experience"
        action={
          <Button type="button" variant="outline" size="sm" onClick={() => set("experience", [...value.experience, { company: "", title: "", location: null, start: null, end: null, bullets: [] }])}>
            <Plus /> Add role
          </Button>
        }
      >
        {value.experience.length === 0 ? <p className="text-sm text-muted-foreground">No work experience yet — that&apos;s fine for freshers. Add projects below.</p> : null}
        {value.experience.map((e, i) => {
          const upd = (patch: Partial<R["experience"][number]>) => set("experience", value.experience.map((x, j) => (j === i ? { ...x, ...patch } : x)));
          return (
            <div key={i} className="space-y-3 rounded-card border bg-background p-4">
              <div className="flex items-center justify-between">
                <p className="font-semibold">{e.title || "New role"}{e.company ? ` · ${e.company}` : ""}</p>
                <RowTools i={i} length={value.experience.length} label={`role ${i + 1}`} onMove={(d) => set("experience", move(value.experience, i, d))} onRemove={() => set("experience", value.experience.filter((_, j) => j !== i))} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Job title" htmlFor={id(`exp-${i}-title`)}>
                  <Input id={id(`exp-${i}-title`)} value={e.title} onChange={(ev) => upd({ title: ev.target.value })} />
                </Field>
                <Field label="Company" htmlFor={id(`exp-${i}-company`)}>
                  <Input id={id(`exp-${i}-company`)} value={e.company} onChange={(ev) => upd({ company: ev.target.value })} />
                </Field>
                <Field label="Start (e.g. Jan 2021)" htmlFor={id(`exp-${i}-start`)}>
                  <Input id={id(`exp-${i}-start`)} value={e.start ?? ""} onChange={(ev) => upd({ start: nullable(ev.target.value) })} />
                </Field>
                <Field label="End (or Present)" htmlFor={id(`exp-${i}-end`)}>
                  <Input id={id(`exp-${i}-end`)} value={e.end ?? ""} onChange={(ev) => upd({ end: nullable(ev.target.value) })} />
                </Field>
              </div>
              <Field label="Achievements (one bullet per line)" htmlFor={id(`exp-${i}-bullets`)}>
                <TextListField id={id(`exp-${i}-bullets`)} rows={5} value={e.bullets} onChange={(b) => upd({ bullets: b })} />
              </Field>
            </div>
          );
        })}
      </Section>

      <Section
        title="Projects"
        action={
          <Button type="button" variant="outline" size="sm" onClick={() => set("projects", [...value.projects, { name: "", description: null, tech: [], bullets: [], url: null }])}>
            <Plus /> Add project
          </Button>
        }
      >
        {value.projects.map((p, i) => {
          const upd = (patch: Partial<R["projects"][number]>) => set("projects", value.projects.map((x, j) => (j === i ? { ...x, ...patch } : x)));
          return (
            <div key={i} className="space-y-3 rounded-card border bg-background p-4">
              <div className="flex items-center justify-between">
                <p className="font-semibold">{p.name || "New project"}</p>
                <RowTools i={i} length={value.projects.length} label={`project ${i + 1}`} onMove={(d) => set("projects", move(value.projects, i, d))} onRemove={() => set("projects", value.projects.filter((_, j) => j !== i))} />
              </div>
              <Field label="Project name" htmlFor={id(`proj-${i}-name`)}>
                <Input id={id(`proj-${i}-name`)} value={p.name} onChange={(ev) => upd({ name: ev.target.value })} />
              </Field>
              <Field label="Technologies (comma separated)" htmlFor={id(`proj-${i}-tech`)}>
                <TextListField id={id(`proj-${i}-tech`)} mode="commas" value={p.tech} onChange={(t) => upd({ tech: t })} />
              </Field>
              <Field label="Details (one bullet per line)" htmlFor={id(`proj-${i}-bullets`)}>
                <TextListField id={id(`proj-${i}-bullets`)} rows={3} value={p.bullets} onChange={(b) => upd({ bullets: b })} />
              </Field>
            </div>
          );
        })}
      </Section>

      <Section
        title="Education"
        action={
          <Button type="button" variant="outline" size="sm" onClick={() => set("education", [...value.education, { institution: "", degree: null, field: null, start: null, end: null, grade: null }])}>
            <Plus /> Add education
          </Button>
        }
      >
        {value.education.map((e, i) => {
          const upd = (patch: Partial<R["education"][number]>) => set("education", value.education.map((x, j) => (j === i ? { ...x, ...patch } : x)));
          return (
            <div key={i} className="space-y-3 rounded-card border bg-background p-4">
              <div className="flex items-center justify-between">
                <p className="font-semibold">{e.institution || "New entry"}</p>
                <RowTools i={i} length={value.education.length} label={`education ${i + 1}`} onMove={(d) => set("education", move(value.education, i, d))} onRemove={() => set("education", value.education.filter((_, j) => j !== i))} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Institution" htmlFor={id(`edu-${i}-inst`)}>
                  <Input id={id(`edu-${i}-inst`)} value={e.institution} onChange={(ev) => upd({ institution: ev.target.value })} />
                </Field>
                <Field label="Degree" htmlFor={id(`edu-${i}-degree`)}>
                  <Input id={id(`edu-${i}-degree`)} value={e.degree ?? ""} onChange={(ev) => upd({ degree: nullable(ev.target.value) })} />
                </Field>
                <Field label="Field of study" htmlFor={id(`edu-${i}-field`)}>
                  <Input id={id(`edu-${i}-field`)} value={e.field ?? ""} onChange={(ev) => upd({ field: nullable(ev.target.value) })} />
                </Field>
                <Field label="Grade / CGPA" htmlFor={id(`edu-${i}-grade`)}>
                  <Input id={id(`edu-${i}-grade`)} value={e.grade ?? ""} onChange={(ev) => upd({ grade: nullable(ev.target.value) })} />
                </Field>
                <Field label="Start" htmlFor={id(`edu-${i}-start`)}>
                  <Input id={id(`edu-${i}-start`)} value={e.start ?? ""} onChange={(ev) => upd({ start: nullable(ev.target.value) })} />
                </Field>
                <Field label="End" htmlFor={id(`edu-${i}-end`)}>
                  <Input id={id(`edu-${i}-end`)} value={e.end ?? ""} onChange={(ev) => upd({ end: nullable(ev.target.value) })} />
                </Field>
              </div>
            </div>
          );
        })}
      </Section>

      <Section title="Certifications">
        <Field label="One per line: name | issuer | year" htmlFor={id("certs")}>
          <TextListField
            id={id("certs")}
            rows={3}
            value={value.certifications.map((c) => {
              const parts = [c.name, c.issuer ?? "", c.year ?? ""];
              while (parts.length > 1 && !parts[parts.length - 1]) parts.pop();
              return parts.join(" | ");
            })}
            onChange={(lines) =>
              set(
                "certifications",
                lines.map((l) => {
                  const [name, issuer, year] = l.split("|").map((x) => x.trim());
                  return { name: name ?? l, issuer: issuer || null, year: year || null };
                }),
              )
            }
          />
        </Field>
      </Section>
    </div>
  );
}
