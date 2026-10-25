import Image from "next/image";

// Store logo: the uploaded logo once the backend provides one, otherwise the
// brand's initial on a white tile (same footprint, so cards don't shift later).
export function BrandLogo({
  name,
  logoUrl,
  className = "h-16 w-16",
}: {
  name: string;
  logoUrl: string | null;
  className?: string;
}) {
  return (
    <span
      className={`relative flex flex-none items-center justify-center overflow-hidden rounded-2xl border-[3px] border-white bg-white shadow-card ${className}`}
    >
      {logoUrl ? (
        <Image src={logoUrl} alt={`${name} logo`} fill sizes="96px" className="object-cover" />
      ) : (
        <span className="font-display text-3xl leading-none text-ink" aria-hidden="true">
          {name.charAt(0)}
        </span>
      )}
    </span>
  );
}

export function BrandBanner({
  bannerUrl,
  className = "h-28",
}: {
  bannerUrl: string | null;
  className?: string;
}) {
  return (
    <div className={`relative overflow-hidden bg-mf-blue ${className}`}>
      {bannerUrl ? (
        <Image src={bannerUrl} alt="" fill sizes="(min-width: 1024px) 1200px, 100vw" className="object-cover" />
      ) : (
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(circle_at_85%_10%,rgba(255,255,255,0.35),transparent_45%)]"
        />
      )}
    </div>
  );
}
