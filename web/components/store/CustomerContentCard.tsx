"use client";

import { useState } from "react";
import { Card } from "@/components/ui";
import { parseSpec } from "@/lib/orbit-backend-spec";

interface Rec {
  id: string;
  collection: string;
  data: string;
  status: string;
  createdAt: string;
}

/**
 * Everything customers submitted through the storefront (reviews, complaints, wishlist, any
 * collection Orbit Code created). Pending items can be approved / hidden inline.
 */
export function CustomerContentCard({
  businessId,
  backend,
  records,
}: {
  businessId: string;
  backend: string | null;
  records: Rec[];
}) {
  const spec = parseSpec(backend);
  const [items, setItems] = useState(records);

  const collections = [...new Set(items.map((r) => r.collection))];
  const label = (c: string) => spec.collections.find((x) => x.name === c)?.label ?? (c === "support" ? "Complaints & feedback" : c);

  async function setStatus(id: string, collection: string, status: string) {
    setItems((cur) => cur.map((r) => (r.id === id ? { ...r, status } : r)));
    await fetch(`/api/store/${businessId}/records/${collection}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).catch(() => {});
  }

  return (
    <Card className="p-6">
      <div className="text-[15px] font-semibold">Customer content</div>
      <div className="mt-4 space-y-6">
        {collections.map((c) => {
          const rows = items.filter((r) => r.collection === c);
          const pending = rows.filter((r) => r.status === "pending").length;
          return (
            <div key={c}>
              <div className="flex items-center justify-between text-[13.5px] font-medium capitalize">
                <span>{label(c)}</span>
                <span className="text-text-faint">
                  {rows.length} total{pending ? ` · ${pending} to review` : ""}
                </span>
              </div>
              <div className="mt-2 divide-y divide-border">
                {rows.slice(0, 8).map((r) => {
                  let d: Record<string, unknown> = {};
                  try {
                    d = JSON.parse(r.data);
                  } catch {
                    /* ignore */
                  }
                  const name = String(d._name ?? "Anonymous");
                  const text = Object.entries(d)
                    .filter(([k]) => !k.startsWith("_"))
                    .map(([, v]) => String(v))
                    .join(" · ");
                  return (
                    <div key={r.id} className="flex items-start justify-between gap-3 py-3 text-[13px]">
                      <div className="min-w-0">
                        <div className="font-medium">
                          {name} <span className="text-text-faint">· {new Date(r.createdAt).toLocaleDateString()}</span>
                          {r.status !== "published" && (
                            <span className="ml-2 rounded bg-panel px-1.5 py-0.5 text-[11px] text-text-faint">{r.status}</span>
                          )}
                        </div>
                        <p className="mt-1 truncate text-text-dim">{text}</p>
                      </div>
                      <div className="flex flex-none gap-1.5">
                        {r.status !== "published" && (
                          <button onClick={() => setStatus(r.id, c, "published")} className="rounded border border-border px-2 py-1 text-[11.5px] hover:text-text">
                            Approve
                          </button>
                        )}
                        {r.status !== "hidden" && (
                          <button onClick={() => setStatus(r.id, c, "hidden")} className="rounded border border-border px-2 py-1 text-[11.5px] text-text-faint hover:text-text">
                            Hide
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
