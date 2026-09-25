"use client";

import { useEffect, useState } from "react";
import { Card, Button } from "@/components/ui";
import { Truck } from "lucide-react";
import { money } from "@/lib/money";

interface Zone {
  id: string;
  name: string;
  cities: string[];
  fee: number;
  freeOver: number | null;
  priority: number;
}

export function ShippingZonesManager({ businessId, currency }: { businessId: string; currency?: string }) {
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [citiesInput, setCitiesInput] = useState("");
  const [fee, setFee] = useState("");
  const [freeOver, setFreeOver] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    fetch(`/api/store/${businessId}/admin/shipping-zones`)
      .then((r) => r.json())
      .then((d) => setZones(Array.isArray(d.zones) ? d.zones : []))
      .catch(() => {})
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  function resetForm() {
    setName("");
    setCitiesInput("");
    setFee("");
    setFreeOver("");
    setError(null);
  }

  async function submitCreate() {
    setError(null);
    const cities = citiesInput.split(",").map((c) => c.trim()).filter(Boolean);
    if (!name.trim()) return setError("Give the zone a name.");
    if (cities.length === 0) return setError("Add at least one city, comma-separated.");
    if (!Number.isFinite(Number(fee)) || Number(fee) < 0) return setError("Enter a valid delivery fee.");

    setBusy(true);
    const r = await fetch(`/api/store/${businessId}/admin/shipping-zones`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        cities,
        fee: Number(fee),
        freeOver: freeOver === "" ? null : Number(freeOver),
        priority: zones.length,
      }),
    });
    const d = await r.json();
    setBusy(false);
    if (r.ok) {
      setCreateOpen(false);
      resetForm();
      load();
    } else {
      setError(d.error ?? "Couldn't create that zone.");
    }
  }

  async function remove(z: Zone) {
    setZones((cur) => cur.filter((x) => x.id !== z.id));
    await fetch(`/api/store/${businessId}/admin/shipping-zones?zoneId=${z.id}`, { method: "DELETE" }).catch(() => {});
  }

  const input = "w-full rounded-lg border border-border bg-panel px-3 py-2 text-[13px] outline-none focus:border-accent-strong/40";

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 text-[14px] font-semibold">
        <Truck className="h-4 w-4 text-text-dim" /> Shipping zones
      </div>
      <p className="mt-1 text-[12.5px] text-text-dim">
        Charge a different delivery fee by city — e.g. Rs 150 within Lahore, Rs 300 everywhere else. A city that doesn&apos;t match any zone uses your
        flat delivery fee above.
      </p>

      <div className="mt-4">
        <Button onClick={() => setCreateOpen(true)} className="!py-2 !text-[13px]">
          New zone
        </Button>
      </div>

      <div className="mt-5">
        {loading ? (
          <p className="text-[13px] text-text-faint">Loading…</p>
        ) : zones.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border py-6 text-center text-[13px] text-text-faint">
            No zones yet — every order uses your flat delivery fee.
          </p>
        ) : (
          <div className="grid gap-2">
            {zones.map((z) => (
              <div key={z.id} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-[13.5px] font-medium">{z.name}</span>
                  <span className="ml-auto font-mono text-[13px] font-semibold">{money(z.fee, currency)}</span>
                  <button onClick={() => remove(z)} className="rounded-lg border border-bad/30 px-2 py-1 text-[11.5px] font-medium text-bad">
                    Delete
                  </button>
                </div>
                <div className="mt-1.5 text-[12px] text-text-dim">{z.cities.join(", ")}</div>
                {z.freeOver != null && (
                  <div className="mt-1 text-[11.5px] text-text-faint">Free over {money(z.freeOver, currency)}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {createOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => {
            setCreateOpen(false);
            resetForm();
          }}
        >
          <div className="w-full max-w-sm rounded-xl border border-border bg-panel p-5" onClick={(e) => e.stopPropagation()}>
            <div className="text-[13.5px] font-semibold">New shipping zone</div>
            <div className="mt-3 grid gap-3">
              <label className="grid gap-1.5">
                <span className="text-[12px] font-medium text-text-dim">Name</span>
                <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Lahore" />
              </label>
              <label className="grid gap-1.5">
                <span className="text-[12px] font-medium text-text-dim">Cities (comma-separated)</span>
                <input className={input} value={citiesInput} onChange={(e) => setCitiesInput(e.target.value)} placeholder="Lahore, Model Town" />
              </label>
              <label className="grid gap-1.5">
                <span className="text-[12px] font-medium text-text-dim">Delivery fee ({currency ?? "unit"})</span>
                <input className={input} type="number" min={0} step={1} value={fee} onChange={(e) => setFee(e.target.value)} placeholder="e.g. 150" />
              </label>
              <label className="grid gap-1.5">
                <span className="text-[12px] font-medium text-text-dim">Free delivery over (optional)</span>
                <input className={input} type="number" min={0} step={1} value={freeOver} onChange={(e) => setFreeOver(e.target.value)} />
              </label>
            </div>
            {error && <p className="mt-2 text-[12px] text-bad">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setCreateOpen(false);
                  resetForm();
                }}
                className="!py-2 !text-[13px]"
              >
                Cancel
              </Button>
              <Button onClick={submitCreate} disabled={busy} className="!py-2 !text-[13px]">
                {busy ? "Creating…" : "Create zone"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
