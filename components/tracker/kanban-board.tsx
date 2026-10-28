"use client";

import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { CalendarClock, GripVertical, NotebookPen, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { api } from "@/lib/api-client";
import { formatDate, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

export type Status = "SAVED" | "APPLIED" | "INTERVIEWING" | "OFFER" | "REJECTED";

export interface TrackerCard {
  id: string;
  status: Status;
  notes: string | null;
  followUpDate: string | null; // ISO
  appliedAt: string | null;
  jobId: string;
  title: string;
  company: string;
  location: string | null;
  hasTailored: boolean;
  /** Set when outreach is running for this job (A6). */
  outreach?: { campaignId: string; status: string; replies: number } | null;
}

const COLUMNS: Array<{ status: Status; label: string; tone: string }> = [
  { status: "SAVED", label: "Saved", tone: "border-t-input-border" },
  { status: "APPLIED", label: "Applied", tone: "border-t-primary" },
  { status: "INTERVIEWING", label: "Interviewing", tone: "border-t-[#3b6ea5]" },
  { status: "OFFER", label: "Offer", tone: "border-t-success" },
  { status: "REJECTED", label: "Rejected", tone: "border-t-danger" },
];

const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

function CardBody({ card, onOpen, onMove, dragging, handle }: { card: TrackerCard; onOpen?: () => void; onMove?: (s: Status) => void; dragging?: boolean; handle?: React.ReactNode }) {
  const overdue = card.followUpDate && new Date(card.followUpDate) < new Date(new Date().toDateString()) && card.status !== "REJECTED" && card.status !== "OFFER";
  return (
    <div className={cn("space-y-2 rounded-card border bg-card p-3 shadow-sm", dragging && "rotate-1 shadow-lg")}>
      <div className="flex items-start gap-1">
        {handle}
        <div className="min-w-0 flex-1">
          <Link href={`/jobs/${card.jobId}`} className="block font-semibold leading-snug hover:underline">
            {card.title}
          </Link>
          <p className="truncate text-sm text-muted-foreground">{card.company}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {card.appliedAt ? <Badge variant="muted">Applied {timeAgo(card.appliedAt)}</Badge> : null}
        {card.hasTailored ? <Badge variant="gold">Tailored resume</Badge> : null}
        {card.outreach ? (
          <Link href={`/outreach/${card.outreach.campaignId}`} aria-label="Open outreach for this job">
            <Badge variant={card.outreach.replies > 0 ? "success" : card.outreach.status === "PAUSED" ? "warning" : "default"}>
              {card.outreach.status === "PAUSED" ? "Outreach paused" : "Outreach active"}
              {card.outreach.replies > 0 ? ` · ${card.outreach.replies} ${card.outreach.replies === 1 ? "reply" : "replies"}` : ""}
            </Badge>
          </Link>
        ) : null}
        {card.followUpDate ? (
          <Badge variant={overdue ? "danger" : "default"}>
            <CalendarClock className="size-3" aria-hidden /> Follow up {formatDate(card.followUpDate)}
          </Badge>
        ) : null}
      </div>
      {card.notes ? <p className="line-clamp-2 text-xs text-muted-foreground">{card.notes}</p> : null}
      <div className="flex items-center gap-2">
        {onMove ? (
          <>
            <label className="sr-only" htmlFor={`move-${card.id}`}>Move {card.title} to</label>
            <Select id={`move-${card.id}`} value={card.status} onChange={(e) => onMove(e.target.value as Status)} className="h-8 flex-1 rounded-md py-0 text-xs">
              {COLUMNS.map((c) => (
                <option key={c.status} value={c.status}>{c.label}</option>
              ))}
            </Select>
          </>
        ) : null}
        {onOpen ? (
          <Button type="button" variant="ghost" size="sm" className="h-8 px-2" onClick={onOpen} aria-label={`Notes and follow-up for ${card.title}`}>
            <NotebookPen />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function DraggableCard({ card, onOpen, onMove }: { card: TrackerCard; onOpen: () => void; onMove: (s: Status) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id });
  return (
    <div ref={setNodeRef} className={cn(isDragging && "opacity-40")}>
      <CardBody
        card={card}
        onOpen={onOpen}
        onMove={onMove}
        handle={
          <button type="button" className="-ml-1 mt-0.5 cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing" aria-label={`Drag ${card.title}. Press space to pick up, arrow keys to move, space to drop.`} {...attributes} {...listeners}>
            <GripVertical className="size-4" />
          </button>
        }
      />
    </div>
  );
}

function Column({ status, label, tone, cards, onOpen, onMove }: { status: Status; label: string; tone: string; cards: TrackerCard[]; onOpen: (c: TrackerCard) => void; onMove: (id: string, s: Status) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section aria-label={`${label} (${cards.length})`} className={cn("flex w-[17.5rem] shrink-0 snap-start flex-col rounded-card border border-t-4 bg-muted/50 lg:w-auto lg:min-w-0 lg:flex-1", tone, isOver && "bg-primary/10")}>
      <h2 className="flex items-center justify-between px-3 pb-1 pt-3 font-sans text-sm font-bold">
        {label} <span className="rounded-full bg-card px-2 py-0.5 text-xs font-semibold text-muted-foreground">{cards.length}</span>
      </h2>
      <div ref={setNodeRef} className="flex min-h-32 flex-1 flex-col gap-2 p-2">
        {cards.map((c) => (
          <DraggableCard key={c.id} card={c} onOpen={() => onOpen(c)} onMove={(s) => onMove(c.id, s)} />
        ))}
        {cards.length === 0 ? <p className="m-auto px-2 py-6 text-center text-xs text-muted-foreground">Drop jobs here</p> : null}
      </div>
    </section>
  );
}

export function KanbanBoard({ initial }: { initial: TrackerCard[] }) {
  const [cards, setCards] = useState(initial);
  const [active, setActive] = useState<TrackerCard | null>(null);
  const [editing, setEditing] = useState<TrackerCard | null>(null);
  const [notes, setNotes] = useState("");
  const [follow, setFollow] = useState("");
  const [saving, setSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  async function move(id: string, status: Status) {
    const prev = cards;
    const card = cards.find((c) => c.id === id);
    if (!card || card.status === status) return;
    setCards((cs) => cs.map((c) => (c.id === id ? { ...c, status, appliedAt: status === "APPLIED" && !c.appliedAt ? new Date().toISOString() : c.appliedAt } : c)));
    try {
      await api(`/api/applications/${id}`, { method: "PATCH", json: { status } });
    } catch (e) {
      setCards(prev);
      toast.error((e as Error).message);
    }
  }

  function onDragEnd(e: DragEndEvent) {
    setActive(null);
    const status = e.over?.id as Status | undefined;
    if (status && COLUMNS.some((c) => c.status === status)) void move(String(e.active.id), status);
  }

  function open(c: TrackerCard) {
    setEditing(c);
    setNotes(c.notes ?? "");
    setFollow(toDateInput(c.followUpDate));
  }

  async function saveDetails() {
    if (!editing) return;
    setSaving(true);
    try {
      await api(`/api/applications/${editing.id}`, { method: "PATCH", json: { notes: notes || null, followUpDate: follow || null } });
      setCards((cs) => cs.map((c) => (c.id === editing.id ? { ...c, notes: notes || null, followUpDate: follow ? `${follow}T09:00:00.000Z` : null } : c)));
      setEditing(null);
      toast.success("Saved");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!editing || !confirm("Remove this job from your tracker?")) return;
    try {
      await api(`/api/applications/${editing.id}`, { method: "DELETE" });
      setCards((cs) => cs.filter((c) => c.id !== editing.id));
      setEditing(null);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <>
      <DndContext id="tracker-dnd" sensors={sensors} onDragStart={(e: DragStartEvent) => setActive(cards.find((c) => c.id === e.active.id) ?? null)} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
        <div className="relative -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0 lg:overflow-visible">
          {COLUMNS.map((col) => (
            <Column key={col.status} {...col} cards={cards.filter((c) => c.status === col.status)} onOpen={open} onMove={move} />
          ))}
        </div>
        <DragOverlay>{active ? <div className="w-[17rem]"><CardBody card={active} dragging /></div> : null}</DragOverlay>
      </DndContext>

      <Dialog open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogTitle>{editing?.title}</DialogTitle>
          <DialogDescription>{editing?.company}</DialogDescription>
          <div className="mt-4 space-y-4">
            <Field label="Follow-up date" htmlFor="followup">
              <Input id="followup" type="date" value={follow} onChange={(e) => setFollow(e.target.value)} />
            </Field>
            <Field label="Notes" htmlFor="notes" hint="Recruiter name, interview rounds, salary discussed…">
              <Textarea id="notes" rows={6} maxLength={5000} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
            <div className="flex flex-wrap justify-between gap-2">
              <Button variant="ghost" className="text-danger" onClick={remove}>
                <Trash2 /> Remove
              </Button>
              <Button onClick={saveDetails} loading={saving}>
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
