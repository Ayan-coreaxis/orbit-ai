"use client";

import { useEffect, useState } from "react";
import { Card, SectionLabel, Pill } from "@/components/ui";
import { GraduationCap, Plus, X, Trash2 } from "lucide-react";

interface Skill {
  id: string;
  name: string;
  description: string;
  instructions: string;
  alwaysOn: boolean;
  enabled: boolean;
}

const BLANK = { name: "", description: "", instructions: "", alwaysOn: false };

export function SkillsManager() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/skills");
      const data = await res.json();
      setSkills(data.skills ?? []);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let alive = true;
    fetch("/api/skills")
      .then((r) => r.json())
      .then((data) => alive && setSkills(data.skills ?? []))
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't save.");
      setForm(BLANK);
      setShowForm(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setSkills((ss) => ss.map((s) => (s.id === id ? { ...s, ...body } : s)));
    await fetch(`/api/skills/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  async function remove(id: string) {
    await fetch(`/api/skills/${id}`, { method: "DELETE" });
    setSkills((ss) => ss.filter((s) => s.id !== id));
  }

  return (
    <Card className="p-7">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-4 w-4 text-text-faint" />
          <SectionLabel>Skills</SectionLabel>
        </div>
        <button
          onClick={() => {
            setShowForm((s) => !s);
            setForm(BLANK);
            setError(null);
          }}
          className="flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-1.5 text-[12.5px] font-medium text-text-dim hover:text-text"
        >
          {showForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {showForm ? "Cancel" : "Add a skill"}
        </button>
      </div>
      <p className="mt-2 max-w-2xl text-[12.5px] leading-relaxed text-text-faint">
        Named blocks of guidance — a brand voice, a returns-reply playbook, a content formula.
        When an agent runs it pulls in the skills that fit the task in front of it (or every
        &ldquo;always on&rdquo; skill) and follows them for that run only.
      </p>

      {showForm && (
        <div className="mt-4 space-y-3 rounded-xl border border-border p-4">
          <input
            className="input w-full"
            placeholder="Name, e.g. Brand voice"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            className="input w-full"
            placeholder="One line — when should an agent use this? (used to match it to tasks)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <textarea
            className="input w-full"
            style={{ minHeight: 120, resize: "vertical" }}
            placeholder="The actual guidance the agent should follow. Plain text or markdown."
            value={form.instructions}
            onChange={(e) => setForm({ ...form, instructions: e.target.value })}
          />
          <label className="flex items-center gap-2 text-[12.5px] text-text-dim">
            <input
              type="checkbox"
              checked={form.alwaysOn}
              onChange={(e) => setForm({ ...form, alwaysOn: e.target.checked })}
            />
            Always on — load this every run without checking relevance
          </label>
          <div className="flex items-center gap-3">
            <button
              onClick={save}
              disabled={!form.name.trim() || !form.description.trim() || !form.instructions.trim() || saving}
              className="gradient-fill rounded-lg px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save skill"}
            </button>
            {error && <span className="text-[12px] text-bad">{error}</span>}
          </div>
        </div>
      )}

      <div className="mt-4 space-y-2.5">
        {loading ? (
          [0, 1].map((i) => <div key={i} className="h-[92px] animate-pulse rounded-xl border border-border bg-panel-2/50" />)
        ) : skills.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-panel-2">
              <GraduationCap className="h-4 w-4 text-text-faint" />
            </span>
            <p className="mt-2.5 text-[13px] font-medium text-text-dim">No skills yet</p>
            <p className="mt-1 text-[12px] text-text-faint">
              Install a plugin above, or add a brand voice or reply playbook of your own.
            </p>
          </div>
        ) : (
          skills.map((s) => (
            <div key={s.id} className="rounded-xl border border-border p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13.5px] font-medium">{s.name}</span>
                    <Pill tone={s.enabled ? "good" : "neutral"}>{s.enabled ? "On" : "Off"}</Pill>
                    {s.alwaysOn && <Pill tone="accent">Always on</Pill>}
                  </div>
                  <p className="mt-1 text-[12px] text-text-faint">{s.description}</p>
                  <p className="mt-1.5 whitespace-pre-wrap text-[12px] leading-relaxed text-text-dim">{s.instructions}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => patch(s.id, { enabled: !s.enabled })}
                    className="text-[12px] font-medium text-text-faint hover:text-text"
                  >
                    {s.enabled ? "Turn off" : "Turn on"}
                  </button>
                  <button onClick={() => remove(s.id)} className="text-text-faint hover:text-bad">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <button
                onClick={() => patch(s.id, { alwaysOn: !s.alwaysOn })}
                className="mt-2 text-[11.5px] font-medium text-text-faint hover:text-text"
              >
                {s.alwaysOn ? "Make it task-triggered instead" : "Make it always on"}
              </button>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
