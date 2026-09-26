/** Shown instantly while a dashboard page loads its data. */
export default function DashboardLoading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="border-b border-border px-10 py-6">
        <div className="skeleton h-6 w-48" />
        <div className="skeleton mt-2 h-4 w-72" />
      </div>
      <div className="max-w-[1200px] space-y-5 p-10">
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-28" />
          ))}
        </div>
        <div className="skeleton h-64" />
        <div className="skeleton h-40" />
      </div>
    </div>
  );
}
