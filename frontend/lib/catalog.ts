// Static catalogue used until the supplier/fabric backend is connected.
// Shapes mirror what the backend will return so each list can be swapped
// for a query without touching the pages that read it.

export type Fabric = {
  id: string;
  name: string;
  category: string;
  color: string;
  occasion: string;
  pricePerYard: number;
  recommendedYards: number;
  stitchingFrom: number;
  image: string;
  description: string;
  bestFor: string[];
  care: string;
};

export type Brand = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  fabricIds: string[];
};

export type Template = {
  id: string;
  name: string;
  category: "Kurtis" | "Frocks" | "Maxi" | "Sets";
  image: string;
};

export const FABRICS: Fabric[] = [
  {
    id: "lawn",
    name: "Lawn",
    category: "Lightweight",
    color: "Cream",
    occasion: "Summer",
    pricePerYard: 1850,
    recommendedYards: 4,
    stitchingFrom: 4500,
    image: "/fabrics/lawn.webp",
    description:
      "Soft breathable lawn fabric for everyday custom outfits, summer suits, and comfortable shop-assisted stitching orders.",
    bestFor: ["Summer suits", "Daily wear", "Light embroidery"],
    care: "Gentle wash, low heat iron, avoid harsh bleach.",
  },
  {
    id: "chiffon",
    name: "Chiffon",
    category: "Formal",
    color: "Pink",
    occasion: "Party",
    pricePerYard: 2600,
    recommendedYards: 4.5,
    stitchingFrom: 5200,
    image: "/fabrics/chiffon.webp",
    description:
      "Lightweight flowy chiffon with an elegant fall, suitable for semi-formal dresses, dupattas, and party wear.",
    bestFor: ["Party wear", "Dupatta", "Flowy kameez"],
    care: "Dry clean preferred, steam lightly, store folded.",
  },
  {
    id: "silk",
    name: "Silk",
    category: "Luxury",
    color: "Cream",
    occasion: "Wedding",
    pricePerYard: 5400,
    recommendedYards: 4,
    stitchingFrom: 6500,
    image: "/fabrics/silk.webp",
    description:
      "Premium silk fabric with a rich shine and smooth fall for bridal, formal, and luxury custom outfits.",
    bestFor: ["Wedding wear", "Luxury suits", "Formal shirts"],
    care: "Dry clean only, low steam, keep away from direct sunlight.",
  },
  {
    id: "cotton",
    name: "Cotton",
    category: "Everyday",
    color: "White",
    occasion: "Daily Wear",
    pricePerYard: 1650,
    recommendedYards: 4,
    stitchingFrom: 4200,
    image: "/fabrics/cotton.webp",
    description:
      "Comfortable cotton fabric for clean everyday looks, simple cuts, office wear, and casual stitched outfits.",
    bestFor: ["Casual suits", "Office wear", "Daily comfort"],
    care: "Machine wash cold, medium iron, wash similar colors together.",
  },
  {
    id: "organza",
    name: "Organza",
    category: "Sheer",
    color: "Mint",
    occasion: "Formal",
    pricePerYard: 4200,
    recommendedYards: 4.5,
    stitchingFrom: 6200,
    image: "/fabrics/organza.webp",
    description:
      "Structured sheer organza for premium formal outfits, overlays, dupattas, and statement sleeves.",
    bestFor: ["Formal overlays", "Dupatta", "Statement sleeves"],
    care: "Dry clean recommended, avoid heavy wringing, steam from distance.",
  },
  {
    id: "embroidered",
    name: "Embroidered",
    category: "Premium",
    color: "Navy",
    occasion: "Eid / Festive",
    pricePerYard: 6800,
    recommendedYards: 4,
    stitchingFrom: 7000,
    image: "/fabrics/embroidered.webp",
    description:
      "Detailed embroidered fabric for festive custom clothing with premium threadwork and a ready-to-style look.",
    bestFor: ["Eid outfits", "Formal suits", "Detailed fronts"],
    care: "Dry clean only, iron from reverse side, protect embroidery.",
  },
  {
    id: "festive",
    name: "Festive",
    category: "Festive",
    color: "Gold",
    occasion: "Eid / Festive",
    pricePerYard: 5900,
    recommendedYards: 4,
    stitchingFrom: 6800,
    image: "/fabrics/festive.webp",
    description:
      "Gold-toned festive fabric created for occasion wear, family events, and elegant custom stitched outfits.",
    bestFor: ["Festive suits", "Family events", "Statement dupatta"],
    care: "Dry clean preferred, store in fabric bag, avoid perfumes directly.",
  },
  {
    id: "linen",
    name: "Linen",
    category: "Everyday",
    color: "Beige",
    occasion: "Daily Wear",
    pricePerYard: 2300,
    recommendedYards: 4,
    stitchingFrom: 4700,
    image: "/fabrics/linen.webp",
    description:
      "Textured linen fabric for minimal, premium daily wear with a breathable feel and graceful structure.",
    bestFor: ["Minimal suits", "Daily wear", "Straight cuts"],
    care: "Cold wash, reshape while damp, medium iron with steam.",
  },
  {
    id: "net",
    name: "Net",
    category: "Sheer",
    color: "Purple",
    occasion: "Wedding",
    pricePerYard: 3850,
    recommendedYards: 4.5,
    stitchingFrom: 6400,
    image: "/fabrics/net.webp",
    description: "Delicate net fabric for wedding overlays, dupattas, sleeves, and premium party outfits.",
    bestFor: ["Wedding dupatta", "Party sleeves", "Layered design"],
    care: "Dry clean only, handle gently, avoid sharp jewelry snagging.",
  },
  {
    id: "velvet",
    name: "Velvet",
    category: "Premium",
    color: "Navy",
    occasion: "Winter",
    pricePerYard: 7200,
    recommendedYards: 4,
    stitchingFrom: 7500,
    image: "/fabrics/velvet.webp",
    description: "Rich velvet for winter formals, premium shawl-inspired looks, and heavy occasion wear.",
    bestFor: ["Winter formals", "Premium suits", "Evening wear"],
    care: "Dry clean only, brush gently, hang on padded hanger.",
  },
];

export const FABRIC_FILTERS = {
  category: ["Everyday", "Lightweight", "Luxury", "Formal", "Festive", "Premium", "Sheer"],
  color: ["Cream", "Pink", "Gold", "Navy", "Mint", "Purple", "Beige", "White"],
  occasion: ["Daily Wear", "Summer", "Formal", "Wedding", "Party", "Eid / Festive", "Winter"],
} as const;

const ALL_FABRIC_IDS = FABRICS.map((f) => f.id);

export const BRANDS: Brand[] = [
  { id: "static-khadi", name: "Khadi", slug: "khadi", logoUrl: null, bannerUrl: null, fabricIds: ALL_FABRIC_IDS },
  { id: "static-alkaram", name: "Alkaram", slug: "alkaram", logoUrl: null, bannerUrl: null, fabricIds: ALL_FABRIC_IDS },
  { id: "static-gul-ahmed", name: "Gul Ahmed", slug: "gul-ahmed", logoUrl: null, bannerUrl: null, fabricIds: ALL_FABRIC_IDS },
];

export const TEMPLATE_CATEGORIES = ["Kurtis", "Frocks", "Maxi", "Sets"] as const;

export const TEMPLATES: Template[] = [
  { id: "long-kurti", name: "Long Kurti", category: "Kurtis", image: "/templates/long-kurti.webp" },
  { id: "a-line-frock", name: "A-Line Frock", category: "Frocks", image: "/templates/a-line-frock.webp" },
  { id: "maxi-dress", name: "Maxi Dress", category: "Maxi", image: "/templates/maxi-dress.webp" },
  { id: "abaya", name: "Abaya", category: "Kurtis", image: "/templates/abaya.webp" },
  { id: "2-piece-suit", name: "2-Piece Suit", category: "Sets", image: "/templates/2-piece-suit.webp" },
  { id: "3-piece-suit", name: "3-Piece Suit", category: "Sets", image: "/templates/3-piece-suit.webp" },
  { id: "peplum-set", name: "Peplum Set", category: "Sets", image: "/templates/peplum-set.webp" },
];

export const getBrand = (slug: string) => BRANDS.find((b) => b.slug === slug);
export const getFabric = (id: string) => FABRICS.find((f) => f.id === id);
export const getTemplate = (id: string) => TEMPLATES.find((t) => t.id === id);
export const brandFabrics = (brand: Brand) =>
  brand.fabricIds.map(getFabric).filter((f): f is Fabric => Boolean(f));

export function formatPKR(amount: number): string {
  return `PKR ${new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 }).format(amount)}`;
}

export const formatYards = (y: number) => `${y} ${y === 1 ? "yard" : "yards"}`;
