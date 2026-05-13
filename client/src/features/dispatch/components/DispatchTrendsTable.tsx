import {
  formatDispatchTrendsNumber,
  formatDispatchTrendsTimestamp,
  type DispatchTrendsProjection,
} from '@/features/dispatch/model/trends'

interface DispatchTrendsTableProps {
  projection: DispatchTrendsProjection
}

export function DispatchTrendsTable({ projection }: DispatchTrendsTableProps) {
  return (
    <section
      aria-label="Trends aggregate table"
      data-testid="dispatch-trends-table"
      className="min-h-[20rem] min-w-0 rounded-md border border-[#1f2a3d] bg-[#0f172a] p-4"
    >
      <h3 className="text-sm font-semibold text-white">Aggregate table</h3>
      <div className="mt-4 max-h-[28rem] overflow-auto">
        <table className="w-full min-w-[48rem] border-separate border-spacing-0 text-left text-xs text-[#cbd5e1]">
          <thead className="sticky top-0 bg-[#0f172a] text-[#94a3b8]">
            <tr>
              <th className="border-b border-[#1f2a3d] py-2 pr-3 font-medium">timeStart</th>
              <th className="border-b border-[#1f2a3d] py-2 pr-3 font-medium">timeEnd</th>
              <th className="border-b border-[#1f2a3d] py-2 pr-3 text-right font-medium">min</th>
              <th className="border-b border-[#1f2a3d] py-2 pr-3 text-right font-medium">max</th>
              <th className="border-b border-[#1f2a3d] py-2 pr-3 text-right font-medium">avg</th>
              <th className="border-b border-[#1f2a3d] py-2 pr-3 text-right font-medium">last</th>
              <th className="border-b border-[#1f2a3d] py-2 text-right font-medium">count</th>
            </tr>
          </thead>
          <tbody>
            {projection.tableRows.map((row) => (
              <tr key={`${row.timeStart}:${row.timeEnd}`}>
                <td className="border-b border-[#172033] py-2 pr-3 align-top">
                  <time dateTime={row.timeStart}>
                    {formatDispatchTrendsTimestamp(row.timeStart)}
                  </time>
                </td>
                <td className="border-b border-[#172033] py-2 pr-3 align-top">
                  <time dateTime={row.timeEnd}>
                    {formatDispatchTrendsTimestamp(row.timeEnd)}
                  </time>
                </td>
                <td className="border-b border-[#172033] py-2 pr-3 text-right align-top">
                  {formatDispatchTrendsNumber(row.min)}
                </td>
                <td className="border-b border-[#172033] py-2 pr-3 text-right align-top">
                  {formatDispatchTrendsNumber(row.max)}
                </td>
                <td className="border-b border-[#172033] py-2 pr-3 text-right align-top">
                  {formatDispatchTrendsNumber(row.avg)}
                </td>
                <td className="border-b border-[#172033] py-2 pr-3 text-right align-top">
                  {formatDispatchTrendsNumber(row.last)}
                </td>
                <td className="border-b border-[#172033] py-2 text-right align-top">
                  {row.count}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
