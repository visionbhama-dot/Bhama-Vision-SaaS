import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Client-side cart, persisted to localStorage per store slug. Prices held here
 * are for DISPLAY ONLY — the server always recomputes authoritative prices and
 * totals at checkout from the products table. The cart only ever contributes
 * product ids and quantities.
 */

export interface CartLine {
	productId: string;
	name: string;
	unit: string | null;
	pricePaise: number;
	imageUrl: string | null;
	quantity: number;
}

const keyFor = (slug: string) => `bv_cart:${slug}`;

function read(slug: string): CartLine[] {
	if (typeof window === "undefined") return [];
	try {
		const raw = window.localStorage.getItem(keyFor(slug));
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(
			(l) =>
				l && typeof l.productId === "string" && typeof l.quantity === "number",
		);
	} catch {
		return [];
	}
}

export function clearCart(slug: string) {
	if (typeof window !== "undefined")
		window.localStorage.removeItem(keyFor(slug));
}

export function useCart(slug: string) {
	const [lines, setLines] = useState<CartLine[]>([]);
	const [loaded, setLoaded] = useState(false);

	useEffect(() => {
		setLines(read(slug));
		setLoaded(true);
	}, [slug]);

	useEffect(() => {
		if (!loaded || typeof window === "undefined") return;
		window.localStorage.setItem(keyFor(slug), JSON.stringify(lines));
	}, [slug, lines, loaded]);

	const add = useCallback((line: Omit<CartLine, "quantity">, qty = 1) => {
		setLines((prev) => {
			const i = prev.findIndex((l) => l.productId === line.productId);
			if (i === -1) return [...prev, { ...line, quantity: Math.max(1, qty) }];
			const next = [...prev];
			next[i] = { ...next[i], quantity: Math.min(99, next[i].quantity + qty) };
			return next;
		});
	}, []);

	const setQty = useCallback((productId: string, qty: number) => {
		setLines((prev) => {
			if (qty <= 0) return prev.filter((l) => l.productId !== productId);
			return prev.map((l) =>
				l.productId === productId ? { ...l, quantity: Math.min(99, qty) } : l,
			);
		});
	}, []);

	const remove = useCallback((productId: string) => {
		setLines((prev) => prev.filter((l) => l.productId !== productId));
	}, []);

	const clear = useCallback(() => setLines([]), []);

	const count = useMemo(
		() => lines.reduce((n, l) => n + l.quantity, 0),
		[lines],
	);
	const subtotalPaise = useMemo(
		() => lines.reduce((s, l) => s + l.pricePaise * l.quantity, 0),
		[lines],
	);

	return { lines, loaded, add, setQty, remove, clear, count, subtotalPaise };
}
