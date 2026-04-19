import React from 'react';

export function TableSkeletonRows({ columns = 3, rows = 3 }) {
  return Array.from({ length: rows }).map((_, rowIndex) => (
    <tr key={`skeleton-row-${rowIndex}`} className="border-b border-white/5">
      {Array.from({ length: columns }).map((__, colIndex) => (
        <td key={`skeleton-cell-${rowIndex}-${colIndex}`} className="px-3 py-3">
          <div className="h-3 w-full animate-pulse rounded bg-slate-700/60" />
        </td>
      ))}
    </tr>
  ));
}

export function DashboardEmptyState({
  title,
  description,
  className = 'rounded-xl border border-dashed border-slate-500/40 bg-slate-900/40 p-6 text-center'
}) {
  return (
    <div className={className}>
      <p className="m-0 text-sm font-semibold text-slate-200">{title}</p>
      {description ? <p className="m-0 mt-1 text-xs text-slate-400">{description}</p> : null}
    </div>
  );
}
