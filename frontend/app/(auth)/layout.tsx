import { Logo } from "@/components/brand/logo";
import { Eyebrow, HeadingRule } from "@/components/ui/heading";

const points = [
  "Fabric from brands you trust",
  "Measured by a quick camera scan",
  "Tailor-approved before any cut",
  "Stitched and delivered to your door",
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col lg:flex-row">
      <aside className="relative hidden border-r border-line bg-white/35 backdrop-blur-sm lg:flex lg:w-[44%] lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        <Logo />

        <div className="max-w-md">
          <Eyebrow align="left">Made-to-measure</Eyebrow>
          <h2 className="mt-5 font-display text-5xl font-semibold leading-[1.05] text-ink xl:text-6xl">
            Clothing made to your measure.
          </h2>
          <HeadingRule align="left" className="mt-5" />
          <ul className="mt-10 space-y-4">
            {points.map((point) => (
              <li key={point} className="flex items-center gap-3 text-base text-muted">
                <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-mf-blue text-white shadow-blue">
                  <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
                    <path d="m5 13 4 4L19 7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                {point}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-sm text-muted">© {new Date().getFullYear()} MultiFe</p>
      </aside>

      <main className="flex flex-1 flex-col">
        <div className="border-b border-line bg-white/70 px-4 py-4 backdrop-blur-xl sm:px-6 lg:hidden">
          <Logo />
        </div>
        <div className="flex flex-1 items-start justify-center px-4 py-10 sm:items-center sm:px-6 sm:py-16">
          <div className="w-full max-w-md">{children}</div>
        </div>
      </main>
    </div>
  );
}
