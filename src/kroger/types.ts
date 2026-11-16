export interface Product {
  id: string;
  upc: string;
  description: string;
  imageUrl: string | null;
  brand: string | null;
  size: string | null;
  available: boolean;
  regularPriceCents: number | null;
  promoPriceCents: number | null;
  weightPriceCents: number | null;
  weightUnit: string | null;
}

export interface CartItemInput {
  upc: string;
  quantity: number;
}
