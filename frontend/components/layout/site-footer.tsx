import { LogoMark } from "@/components/brand/logo";

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-white/60 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
          <div className="flex flex-none items-center gap-3">
            <LogoMark className="h-11 w-11" />
            <span className="font-display text-[1.75rem] leading-none text-ink">MultiFe</span>
          </div>
          <span aria-hidden="true" className="hidden h-10 w-px bg-line sm:block" />
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
