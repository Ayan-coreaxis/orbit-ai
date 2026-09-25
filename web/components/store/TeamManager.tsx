"use client";

import { useEffect, useState } from "react";
import { Card, Button } from "@/components/ui";
import { Users } from "lucide-react";

interface Member {
  id: string;
  email: string;
  role: string;
  accepted: boolean;
  invitedAt: string;
}

export function TeamManager() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"staff" | "admin">("staff");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    fetch("/api/business/team")
      .then((r) => r.json())
      .then((d) => setMembers(Array.isArray(d.members) ? d.members : []))
      .catch(() => {})
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  async function submitInvite() {
    setError(null);
    if (!email.trim()) return setError("Enter an email.");
    setBusy(true);
    const r = await fetch("/api/business/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role }),
    });
    const d = await r.json();
    setBusy(false);
    if (r.ok) {
      setInviteOpen(false);
      setEmail("");
      setRole("staff");
      load();
    } else {
      setError(d.error ?? "Couldn't invite that person.");
    }
  }

  async function remove(m: Member) {
    setMembers((cur) => cur.filter((x) => x.id !== m.id));
    await fetch(`/api/business/team?memberId=${m.id}`, { method: "DELETE" }).catch(() => {});
  }

  const input = "w-full rounded-lg border border-border bg-panel px-3 py-2 text-[13px] outline-none focus:border-accent-strong/40";

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[14px] font-semibold">
          <Users className="h-4 w-4 text-text-dim" /> Team
        </div>
        <Button onClick={() => setInviteOpen(true)} className="!py-2 !text-[13px]">
          Invite
        </Button>
      </div>
      <p className="mt-1 text-[12.5px] text-text-dim">
        Give someone else dashboard access to this business. If they already have an account, access is instant; otherwise it activates the moment
        they sign up with that exact email.
      </p>

      <div className="mt-5">
        {loading ? (
          <p className="text-[13px] text-text-faint">Loading…</p>
        ) : members.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border py-6 text-center text-[13px] text-text-faint">
            Just you so far.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-3 py-2.5 text-[13px]">
                <span className="font-medium">{m.email}</span>
                <span className="rounded-full bg-panel-2 px-2 py-0.5 text-[11px] font-medium capitalize text-text-dim">{m.role}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${m.accepted ? "bg-good/15 text-good" : "bg-panel-2 text-text-faint"}`}>
                  {m.accepted ? "Active" : "Pending"}
                </span>
                <button onClick={() => remove(m)} className="ml-auto rounded-lg border border-bad/30 px-2 py-1 text-[11.5px] font-medium text-bad">
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {inviteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => {
            setInviteOpen(false);
            setError(null);
          }}
        >
          <div className="w-full max-w-sm rounded-xl border border-border bg-panel p-5" onClick={(e) => e.stopPropagation()}>
            <div className="text-[13.5px] font-semibold">Invite to your team</div>
            <div className="mt-3 grid gap-3">
              <label className="grid gap-1.5">
                <span className="text-[12px] font-medium text-text-dim">Email</span>
                <input className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@email.com" />
              </label>
              <label className="grid gap-1.5">
                <span className="text-[12px] font-medium text-text-dim">Role</span>
                <select className={input} value={role} onChange={(e) => setRole(e.target.value === "admin" ? "admin" : "staff")}>
                  <option value="staff">Staff</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
            </div>
            {error && <p className="mt-2 text-[12px] text-bad">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setInviteOpen(false)} className="!py-2 !text-[13px]">
                Cancel
              </Button>
              <Button onClick={submitInvite} disabled={busy || !email} className="!py-2 !text-[13px]">
                {busy ? "Inviting…" : "Invite"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
