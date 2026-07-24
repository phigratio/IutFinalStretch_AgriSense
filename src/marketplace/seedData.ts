export interface SupplierSeed {
  name: string;
  district: string;
  latitude: number;
  longitude: number;
  rating: number;
  deliveryDays: number;
  items: Array<{
    itemName: string;
    category: string;
    unit: string;
    priceBdt: number;
    stockQuantity: number;
  }>;
}

export interface MarketPriceSeed {
  crop: string;
  marketName: string;
  district: string;
  unit: string;
  observedAt: string;
  wholesalePriceBdt: number;
  farmgatePriceBdt: number;
}

export const supplierSeeds: SupplierSeed[] = [
  {
    name: "Bogura Krishi Inputs",
    district: "Bogura",
    latitude: 24.8481,
    longitude: 89.373,
    rating: 4.7,
    deliveryDays: 1,
    items: [
      { itemName: "Urea fertilizer", category: "fertilizer", unit: "kg", priceBdt: 26, stockQuantity: 2200 },
      { itemName: "TSP fertilizer", category: "fertilizer", unit: "kg", priceBdt: 31, stockQuantity: 1200 },
      { itemName: "BRRI dhan 87 seed", category: "seed", unit: "kg", priceBdt: 78, stockQuantity: 450 },
    ],
  },
  {
    name: "Gazipur Agro Supply",
    district: "Gazipur",
    latitude: 23.9999,
    longitude: 90.4203,
    rating: 4.5,
    deliveryDays: 2,
    items: [
      { itemName: "Urea fertilizer", category: "fertilizer", unit: "kg", priceBdt: 25.5, stockQuantity: 1800 },
      { itemName: "MOP fertilizer", category: "fertilizer", unit: "kg", priceBdt: 28, stockQuantity: 900 },
      { itemName: "Hybrid maize seed", category: "seed", unit: "kg", priceBdt: 240, stockQuantity: 260 },
    ],
  },
  {
    name: "Mymensingh Farm Mart",
    district: "Mymensingh",
    latitude: 24.7471,
    longitude: 90.4203,
    rating: 4.8,
    deliveryDays: 3,
    items: [
      { itemName: "Urea fertilizer", category: "fertilizer", unit: "kg", priceBdt: 24.8, stockQuantity: 3500 },
      { itemName: "TSP fertilizer", category: "fertilizer", unit: "kg", priceBdt: 32, stockQuantity: 1100 },
      { itemName: "Mustard seed", category: "seed", unit: "kg", priceBdt: 155, stockQuantity: 300 },
    ],
  },
  {
    name: "Jessore Crop Care",
    district: "Jashore",
    latitude: 23.1667,
    longitude: 89.2167,
    rating: 4.3,
    deliveryDays: 4,
    items: [
      { itemName: "Urea fertilizer", category: "fertilizer", unit: "kg", priceBdt: 26.8, stockQuantity: 1500 },
      { itemName: "Vegetable pesticide pack", category: "crop_protection", unit: "pack", priceBdt: 620, stockQuantity: 90 },
      { itemName: "Boro rice seed", category: "seed", unit: "kg", priceBdt: 72, stockQuantity: 520 },
    ],
  },
];

export const marketPriceSeeds: MarketPriceSeed[] = [
  { crop: "rice", marketName: "Bogura wholesale", district: "Bogura", unit: "kg", observedAt: "2026-07-03", wholesalePriceBdt: 46, farmgatePriceBdt: 41 },
  { crop: "rice", marketName: "Bogura wholesale", district: "Bogura", unit: "kg", observedAt: "2026-07-10", wholesalePriceBdt: 47, farmgatePriceBdt: 42 },
  { crop: "rice", marketName: "Bogura wholesale", district: "Bogura", unit: "kg", observedAt: "2026-07-17", wholesalePriceBdt: 49, farmgatePriceBdt: 44 },
  { crop: "rice", marketName: "Bogura wholesale", district: "Bogura", unit: "kg", observedAt: "2026-07-24", wholesalePriceBdt: 51, farmgatePriceBdt: 46 },
  { crop: "maize", marketName: "Gazipur wholesale", district: "Gazipur", unit: "kg", observedAt: "2026-07-03", wholesalePriceBdt: 31, farmgatePriceBdt: 27 },
  { crop: "maize", marketName: "Gazipur wholesale", district: "Gazipur", unit: "kg", observedAt: "2026-07-10", wholesalePriceBdt: 30, farmgatePriceBdt: 26 },
  { crop: "maize", marketName: "Gazipur wholesale", district: "Gazipur", unit: "kg", observedAt: "2026-07-17", wholesalePriceBdt: 29, farmgatePriceBdt: 25 },
  { crop: "maize", marketName: "Gazipur wholesale", district: "Gazipur", unit: "kg", observedAt: "2026-07-24", wholesalePriceBdt: 28, farmgatePriceBdt: 24 },
  { crop: "mustard", marketName: "Mymensingh wholesale", district: "Mymensingh", unit: "kg", observedAt: "2026-07-03", wholesalePriceBdt: 86, farmgatePriceBdt: 78 },
  { crop: "mustard", marketName: "Mymensingh wholesale", district: "Mymensingh", unit: "kg", observedAt: "2026-07-10", wholesalePriceBdt: 87, farmgatePriceBdt: 79 },
  { crop: "mustard", marketName: "Mymensingh wholesale", district: "Mymensingh", unit: "kg", observedAt: "2026-07-17", wholesalePriceBdt: 87, farmgatePriceBdt: 79 },
  { crop: "mustard", marketName: "Mymensingh wholesale", district: "Mymensingh", unit: "kg", observedAt: "2026-07-24", wholesalePriceBdt: 88, farmgatePriceBdt: 80 },
];
