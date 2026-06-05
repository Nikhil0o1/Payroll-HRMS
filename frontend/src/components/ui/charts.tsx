import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";

export const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

interface Datum {
  name: string;
  value: number;
  color?: string;
}

function ChartTooltip({ active, payload, valueFormatter, showLabel }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-pop min-w-[180px]">
      {showLabel && payload[0]?.payload?.name ? (
        <div className="mb-1.5 pb-1.5 border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {payload[0].payload.name}
        </div>
      ) : null}
      <div className="space-y-1">
        {payload.map((p: any, i: number) => (
          <div key={i} className="flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: p.color || p.fill || p.payload?.color }}
            />
            <span className="text-muted-foreground">{p.name ?? p.payload?.name}</span>
            <span className="ml-auto font-semibold tabular text-foreground">
              {valueFormatter ? valueFormatter(p.value) : p.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Donut / ring chart with optional centered content. */
export function DonutChart({
  data,
  height = 200,
  thickness = 26,
  valueFormatter,
  center,
  className,
}: {
  data: Datum[];
  height?: number;
  thickness?: number;
  valueFormatter?: (v: number) => string;
  center?: React.ReactNode;
  className?: string;
}) {
  const hasData = data.some((d) => d.value > 0);
  return (
    <div className={cn("relative", className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={hasData ? data : [{ name: "No data", value: 1, color: "hsl(var(--muted))" }]}
            dataKey="value"
            nameKey="name"
            innerRadius={`${100 - thickness - 30}%`}
            outerRadius="100%"
            paddingAngle={hasData ? 2 : 0}
            stroke="none"
          >
            {(hasData ? data : [{ color: "hsl(var(--muted))" }]).map((d, i) => (
              <Cell key={i} fill={d.color || CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Pie>
          {hasData ? <Tooltip content={<ChartTooltip valueFormatter={valueFormatter} />} /> : null}
        </PieChart>
      </ResponsiveContainer>
      {center ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          {center}
        </div>
      ) : null}
    </div>
  );
}

/** Vertical bar chart for categorical comparisons. */
export function MiniBars({
  data,
  height = 200,
  color = "hsl(var(--chart-1))",
  valueFormatter,
}: {
  data: Datum[];
  height?: number;
  color?: string;
  valueFormatter?: (v: number) => string;
}) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
          <XAxis
            dataKey="name"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={36}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted) / 0.5)" }}
            content={<ChartTooltip valueFormatter={valueFormatter} />}
          />
          <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={48}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.color || color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Stacked vertical bars for composition over time (e.g. net + deductions). */
export function StackedBars({
  data,
  series,
  height = 260,
  valueFormatter,
  yFormatter,
}: {
  data: Array<Record<string, number | string>>;
  series: { key: string; name: string; color: string }[];
  height?: number;
  valueFormatter?: (v: number) => string;
  yFormatter?: (v: number) => string;
}) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 16, right: 8, left: -8, bottom: 0 }}>
          <XAxis
            dataKey="name"
            tickLine={false}
            axisLine={{ stroke: "hsl(var(--border))" }}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            interval={0}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={48}
            tickFormatter={yFormatter}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
            content={<ChartTooltip valueFormatter={valueFormatter} showLabel />}
          />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.name}
              stackId="a"
              fill={s.color}
              maxBarSize={14}
              radius={i === series.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Smooth area trend (good for headcount / payout over time). */
export function TrendArea({
  data,
  height = 220,
  color = "hsl(var(--chart-1))",
  valueFormatter,
}: {
  data: { name: string; value: number }[];
  height?: number;
  color?: string;
  valueFormatter?: (v: number) => string;
}) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="name"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={44}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          />
          <Tooltip content={<ChartTooltip valueFormatter={valueFormatter} />} />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fill="url(#trendFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
