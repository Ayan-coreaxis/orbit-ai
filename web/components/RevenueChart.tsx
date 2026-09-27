"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { money } from "@/lib/money";
export interface RevenuePoint {
  day: string;
  revenue: number;
}

export function RevenueChart({ data, currency = "pkr" }: { data: RevenuePoint[]; currency?: string }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ left: -20, right: 10, top: 10 }}>
        <defs>
          <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.28} />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="day"
          stroke="var(--text-faint)"
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          stroke="var(--text-faint)"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => (v >= 1000 ? `${money(0, currency).replace(/0$/, "")}${+(v / 1000).toFixed(1)}k` : money(v, currency))}
        />
        <Tooltip
          contentStyle={{
            background: "var(--panel)",
            border: "1px solid var(--border-strong)",
            borderRadius: 10,
            fontSize: 13,
            boxShadow: "0 4px 16px rgba(0,0,0,0.24)",
          }}
          labelStyle={{ color: "var(--text-dim)" }}
          itemStyle={{ color: "var(--text)" }}
          formatter={(v) => [money(Number(v), currency), "Revenue"]}
        />
        <Area
          type="monotone"
          dataKey="revenue"
          stroke="var(--accent)"
          strokeWidth={2.5}
          fill="url(#rev)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
