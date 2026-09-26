/** Re-mounts on every dashboard navigation, so each page eases in. */
export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  return <div className="orbit-fade-up h-full">{children}</div>;
}
