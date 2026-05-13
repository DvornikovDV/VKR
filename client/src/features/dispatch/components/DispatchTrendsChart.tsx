import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  formatDispatchTrendsNumber,
  formatDispatchTrendsTimestamp,
  type DispatchTrendsProjection,
} from '@/features/dispatch/model/trends'

interface DispatchTrendsChartProps {
  projection: DispatchTrendsProjection
}

export function DispatchTrendsChart({ projection }: DispatchTrendsChartProps) {
  const seriesName = projection.valueMode

  return (
    <section
      aria-label="Trends history chart"
      data-testid="dispatch-trends-chart"
      data-value-mode={seriesName}
      className="flex min-h-[20rem] min-w-0 flex-col rounded-md border border-[#1f2a3d] bg-[#0f172a] p-4"
    >
      <div className="flex flex-shrink-0 flex-col gap-1">
        <h3 className="text-sm font-semibold text-white">History chart</h3>
        <p
          data-testid="dispatch-trends-history-summary"
          className="text-xs text-[#94a3b8]"
        >
          {projection.response.edgeId} / {projection.response.deviceId} / {projection.response.metric}
        </p>
      </div>

      <div className="mt-4 min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={projection.chartPoints}
            margin={{ top: 8, right: 12, bottom: 8, left: 0 }}
          >
            <XAxis
              dataKey="pointTime"
              minTickGap={24}
              stroke="#94a3b8"
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              tickFormatter={(value) => formatDispatchTrendsTimestamp(String(value))}
            />
            <YAxis
              width={56}
              stroke="#94a3b8"
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              tickFormatter={(value) => formatDispatchTrendsNumber(Number(value))}
            />
            <Tooltip
              contentStyle={{
                background: '#0a1220',
                border: '1px solid #334155',
                borderRadius: 6,
                color: '#e2e8f0',
              }}
              labelFormatter={(value) => formatDispatchTrendsTimestamp(String(value))}
              formatter={(value) => [
                formatDispatchTrendsNumber(Number(value)),
                seriesName,
              ]}
            />
            <Line
              type="monotone"
              dataKey="value"
              name={seriesName}
              stroke="#38bdf8"
              strokeWidth={2}
              dot={{ r: 2, fill: '#38bdf8', strokeWidth: 0 }}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
