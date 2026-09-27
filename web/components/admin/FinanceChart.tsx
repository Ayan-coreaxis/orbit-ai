"use client";

import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SeriesPoint } from "@/lib/admin-finance";

const money = (v: number) => `${v < 0 ? "−" : ""}$${Math.abs(v) >= 100 ? Math.round(Math.abs(v)).toLocaleString() : Math.abs(v) >= 10 ? Math.abs(v).toFixed(0) : Math.abs(v).toFixed(2)}`;

/** Revenue vs cost per day / month, with profit as a line. */
export function FinanceChart({ data }: { data: SeriesPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ left: 0, right: 8, top: 10 }}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" stroke="var(--text-faint)" fontSize={11.5} tickLine={false} axisLine={false} minTickGap={16} />
        <YAxis stroke="var(--text-faint)" fontSize={11.5} tickLine={false} axisLine={false} width={56} tickFormatter={(v) => money(Number(v))} />
        <Tooltip
          cursor={{ fill: "var(--panel-2)" }}
          contentStyle={{ background: "var(--panel)", border: "1px solid var(--border-strong)", borderRadius: 10, fontSize: 13 }}
          labelStyle={{ color: "var(--text-dim)" }}
          formatter={(v, name) => [money(Number(v)), String(name)]}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="revenue" name="Revenue" fill="var(--good)" radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Bar dataKey="cost" name="Cost" fill="var(--bad)" radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Line dataKey="profit" name="Profit" type="monotone" stroke="var(--accent)" strokeWidth={2.2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
