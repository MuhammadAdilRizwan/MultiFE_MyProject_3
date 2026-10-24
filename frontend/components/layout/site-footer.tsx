import { LogoMark } from "@/components/brand/logo";

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-white/60 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <LogoMark className="h-8 w-8" />
            <span className="font-display text-xl font-semibold text-ink">MultiFe</span>
          </div>
          <p className="max-w-md text-sm leading-6 text-muted">
            Fabric to finished garment, made to your measurements — stitched in our own workshop
            and delivered to your door.
          </p>
        </div>
        <div className="mt-8 border-t border-line pt-6">
          <p className="text-xs text-hint">© {new Date().getFullYear()} MultiFe. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
