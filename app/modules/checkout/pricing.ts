/**
 * Pure order-pricing logic. No DB, no framework — fully unit-testable. The
 * server is the ONLY place totals are computed; the browser's numbers are never
 * trusted. The checkout service calls this with prices read live from the
 * products table.
 */

export interface PricedLine {
	productId: string;
	variantId: string | null;
	name: string;
	unit: string | null;
	pricePaise: number;
	quantity: number;
	lineTotalPaise: number;
}

export interface StoreCheckoutSettings {
	minOrderPaise: number;
	deliveryFeePaise: number;
	freeDeliveryThresholdPaise: number | null;
}

export interface Totals {
	subtotalPaise: number;
	deliveryPaise: number;
	totalPaise: number;
	freeDeliveryApplied: boolean;
	meetsMinimum: boolean;
	minOrderPaise: number;
}

/** Build a priced line from a product + requested quantity (server prices). */
export function toLine(
	product: {
		id: string;
		name: string;
		unit: string | null;
		pricePaise: number;
	},
	variantId: string | null,
	quantity: number,
): PricedLine {
	const qty = Math.max(0, Math.floor(quantity));
	return {
		productId: product.id,
		variantId,
		name: product.name,
		unit: product.unit,
		pricePaise: product.pricePaise,
		quantity: qty,
		lineTotalPaise: product.pricePaise * qty,
	};
}

export function computeTotals(
	lines: PricedLine[],
	settings: StoreCheckoutSettings,
): Totals {
	const subtotalPaise = lines.reduce((sum, l) => sum + l.lineTotalPaise, 0);

	let deliveryPaise = subtotalPaise > 0 ? settings.deliveryFeePaise : 0;
	let freeDeliveryApplied = false;
	if (
		settings.freeDeliveryThresholdPaise != null &&
		subtotalPaise > 0 &&
		subtotalPaise >= settings.freeDeliveryThresholdPaise
	) {
		deliveryPaise = 0;
		freeDeliveryApplied = true;
	}

	return {
		subtotalPaise,
		deliveryPaise,
		totalPaise: subtotalPaise + deliveryPaise,
		freeDeliveryApplied,
		meetsMinimum: subtotalPaise >= settings.minOrderPaise,
		minOrderPaise: settings.minOrderPaise,
	};
}
