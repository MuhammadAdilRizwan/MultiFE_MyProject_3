import { Logo } from "@/components/brand/logo";

const points = [
  "Fabric from brands you trust",
  "Measured by a quick camera scan",
  "Tailor-approved before any cut",
  "Stitched and delivered to your door",
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col lg:flex-row">
      <aside className="relative hidden overflow-hidden border-r border-line bg-ice-strong lg:flex lg:w-[44%] lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-accent/20 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 -left-20 h-72 w-72 rounded-full bg-ocean/10 blur-3xl"
        />

        <div className="relative">
          <Logo />
        </div>

        <div className="relative max-w-md">
          <h2 className="font-display text-5xl font-semibold leading-[1.05] text-navy xl:text-6xl">
            Clothing made to your measure.
          </h2>
          <ul className="mt-10 space-y-4">
            {points.map((point) => (
              <li key={point} className="flex items-center gap-3 text-base text-muted-strong">
                <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-accent text-white">
                  <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
                    <path d="m5 13 4 4L19 7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                {point}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-sm text-muted">© {new Date().getFullYear()} MultiFe</p>
      </aside>

      <main className="flex flex-1 flex-col">
        <div className="border-b border-line bg-surface px-4 py-4 sm:px-6 lg:hidden">
          <Logo />
        </div>
        <div className="flex flex-1 items-start justify-center px-4 py-10 sm:items-center sm:px-6 sm:py-16">
          <div className="w-full max-w-md">{children}</div>
        </div>
      </main>
    </div>
  );
}
