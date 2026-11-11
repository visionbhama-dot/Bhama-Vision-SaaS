/**
 * Curated master-catalogue seed data (Phase 5).
 *
 * IMPORTANT — data integrity rules (see docs):
 *  - These are GENERIC products (no brand, no fabricated MRP/GTIN/manufacturer
 *    or mandatory declarations). They are clearly labelled as illustrative
 *    sample data (verification_status = 'illustrative').
 *  - Real, specific product data (branded items, actual MRPs, GTINs, images)
 *    is intentionally left empty rather than invented.
 *  - No medicines are included.
 *
 * Each item may list several genuine retail pack sizes; a shopkeeper commonly
 * stocks more than one size, so these are useful variants — not padding.
 *
 * The build script (build-catalogue-seed.mjs) expands this into one
 * master_products row per (item x pack size) and emits an idempotent SQL
 * migration. Re-running regenerates the file deterministically.
 */

/** @typedef {{ name: string, sub: string, sizes: string[], barcode?: boolean }} Item */

const G = "Grocery Essentials";

/** Weight sizes commonly stocked for staples sold by weight. */
const W2 = ["500 g", "1 kg"];
const W3 = ["500 g", "1 kg", "2 kg"];

/** @type {Item[]} */
const grocery = [
	// Pulses & Dals
	{ name: "Toor Dal (Arhar)", sub: "Pulses & Dals", sizes: W2 },
	{ name: "Moong Dal (Split)", sub: "Pulses & Dals", sizes: W2 },
	{ name: "Moong Whole (Green Gram)", sub: "Pulses & Dals", sizes: W2 },
	{ name: "Masoor Dal (Red Lentil)", sub: "Pulses & Dals", sizes: W2 },
	{ name: "Chana Dal (Split Bengal Gram)", sub: "Pulses & Dals", sizes: W2 },
	{ name: "Urad Dal (Split Black Gram)", sub: "Pulses & Dals", sizes: W2 },
	{ name: "Urad Whole", sub: "Pulses & Dals", sizes: W2 },
	{ name: "Kabuli Chana (Chickpeas)", sub: "Pulses & Dals", sizes: W2 },
	{ name: "Kala Chana (Black Chickpeas)", sub: "Pulses & Dals", sizes: W2 },
	{ name: "Rajma (Kidney Beans)", sub: "Pulses & Dals", sizes: W2 },
	{ name: "Lobia (Black-Eyed Peas)", sub: "Pulses & Dals", sizes: ["500 g"] },
	{ name: "Matar (Dried Green Peas)", sub: "Pulses & Dals", sizes: ["500 g"] },
	// Rice & Rice Products
	{ name: "Basmati Rice", sub: "Rice & Grains", sizes: ["1 kg", "5 kg"] },
	{ name: "Sona Masoori Rice", sub: "Rice & Grains", sizes: ["1 kg", "5 kg"] },
	{ name: "Idli Rice", sub: "Rice & Grains", sizes: ["1 kg"] },
	{ name: "Poha (Flattened Rice)", sub: "Rice & Grains", sizes: ["500 g"] },
	{
		name: "Puffed Rice (Murmura)",
		sub: "Rice & Grains",
		sizes: ["200 g", "500 g"],
	},
	{ name: "Brown Rice", sub: "Rice & Grains", sizes: ["1 kg"] },
	// Atta, Flours & Sooji
	{ name: "Whole Wheat Atta", sub: "Atta & Flours", sizes: ["1 kg", "5 kg"] },
	{ name: "Maida (Refined Flour)", sub: "Atta & Flours", sizes: W2 },
	{ name: "Besan (Gram Flour)", sub: "Atta & Flours", sizes: W2 },
	{ name: "Sooji / Rava (Semolina)", sub: "Atta & Flours", sizes: W2 },
	{ name: "Rice Flour", sub: "Atta & Flours", sizes: ["500 g"] },
	{ name: "Ragi Flour", sub: "Atta & Flours", sizes: ["500 g"] },
	{ name: "Jowar Flour", sub: "Atta & Flours", sizes: ["500 g"] },
	{ name: "Bajra Flour", sub: "Atta & Flours", sizes: ["500 g"] },
	{ name: "Cornflour", sub: "Atta & Flours", sizes: ["100 g", "500 g"] },
	// Edible Oils & Ghee
	{ name: "Sunflower Oil", sub: "Oils & Ghee", sizes: ["1 L"] },
	{ name: "Groundnut Oil", sub: "Oils & Ghee", sizes: ["1 L"] },
	{ name: "Mustard Oil", sub: "Oils & Ghee", sizes: ["1 L"] },
	{ name: "Soyabean Oil", sub: "Oils & Ghee", sizes: ["1 L"] },
	{ name: "Coconut Oil", sub: "Oils & Ghee", sizes: ["500 ml"] },
	{ name: "Cow Ghee", sub: "Oils & Ghee", sizes: ["500 ml", "1 L"] },
	{ name: "Vanaspati", sub: "Oils & Ghee", sizes: ["1 L"] },
	// Spices & Masala
	{
		name: "Turmeric Powder (Haldi)",
		sub: "Spices & Masala",
		sizes: ["100 g", "200 g"],
	},
	{
		name: "Red Chilli Powder",
		sub: "Spices & Masala",
		sizes: ["100 g", "200 g"],
	},
	{
		name: "Coriander Powder (Dhania)",
		sub: "Spices & Masala",
		sizes: ["100 g", "200 g"],
	},
	{
		name: "Cumin Seeds (Jeera)",
		sub: "Spices & Masala",
		sizes: ["100 g", "200 g"],
	},
	{ name: "Mustard Seeds (Rai)", sub: "Spices & Masala", sizes: ["100 g"] },
	{ name: "Garam Masala", sub: "Spices & Masala", sizes: ["100 g"] },
	{
		name: "Black Pepper (Kali Mirch)",
		sub: "Spices & Masala",
		sizes: ["100 g"],
	},
	{ name: "Cardamom (Elaichi)", sub: "Spices & Masala", sizes: ["50 g"] },
	{ name: "Cloves (Laung)", sub: "Spices & Masala", sizes: ["50 g"] },
	{ name: "Cinnamon (Dalchini)", sub: "Spices & Masala", sizes: ["50 g"] },
	{ name: "Bay Leaf (Tej Patta)", sub: "Spices & Masala", sizes: ["50 g"] },
	{ name: "Fenugreek Seeds (Methi)", sub: "Spices & Masala", sizes: ["100 g"] },
	{ name: "Carom Seeds (Ajwain)", sub: "Spices & Masala", sizes: ["100 g"] },
	{ name: "Asafoetida (Hing)", sub: "Spices & Masala", sizes: ["50 g"] },
	{ name: "Dry Red Chilli (Whole)", sub: "Spices & Masala", sizes: ["100 g"] },
	// Salt, Sugar & Sweeteners
	{ name: "Iodised Salt", sub: "Salt & Sugar", sizes: ["1 kg"] },
	{ name: "Rock Salt (Sendha Namak)", sub: "Salt & Sugar", sizes: ["500 g"] },
	{ name: "Sugar", sub: "Salt & Sugar", sizes: ["1 kg", "5 kg"] },
	{ name: "Jaggery (Gur)", sub: "Salt & Sugar", sizes: ["500 g", "1 kg"] },
	{ name: "Mishri (Rock Sugar)", sub: "Salt & Sugar", sizes: ["250 g"] },
	// Dry Fruits & Nuts
	{
		name: "Almonds (Badam)",
		sub: "Dry Fruits & Nuts",
		sizes: ["250 g", "500 g"],
	},
	{
		name: "Cashews (Kaju)",
		sub: "Dry Fruits & Nuts",
		sizes: ["250 g", "500 g"],
	},
	{ name: "Raisins (Kishmish)", sub: "Dry Fruits & Nuts", sizes: ["250 g"] },
	{ name: "Walnuts (Akhrot)", sub: "Dry Fruits & Nuts", sizes: ["250 g"] },
	{ name: "Pistachios (Pista)", sub: "Dry Fruits & Nuts", sizes: ["250 g"] },
	{ name: "Dates (Khajoor)", sub: "Dry Fruits & Nuts", sizes: ["500 g"] },
	{ name: "Peanuts (Moongphali)", sub: "Dry Fruits & Nuts", sizes: ["500 g"] },
	// Tea, Coffee & Beverages base
	{
		name: "Tea Leaves (Loose)",
		sub: "Tea & Coffee",
		sizes: ["250 g", "500 g"],
	},
	{ name: "CTC Tea", sub: "Tea & Coffee", sizes: ["250 g", "500 g"] },
	{ name: "Green Tea (Loose)", sub: "Tea & Coffee", sizes: ["100 g"] },
	{ name: "Instant Coffee", sub: "Tea & Coffee", sizes: ["50 g", "100 g"] },
	{ name: "Filter Coffee Powder", sub: "Tea & Coffee", sizes: ["200 g"] },
	{ name: "Drinking Chocolate Powder", sub: "Tea & Coffee", sizes: ["200 g"] },
	// Condiments & Cooking
	{
		name: "Tamarind (Imli)",
		sub: "Condiments & Cooking",
		sizes: ["200 g", "500 g"],
	},
	{
		name: "Ginger Garlic Paste",
		sub: "Condiments & Cooking",
		sizes: ["200 g"],
	},
	{ name: "Tomato Ketchup", sub: "Condiments & Cooking", sizes: ["500 g"] },
	{ name: "Soy Sauce", sub: "Condiments & Cooking", sizes: ["200 ml"] },
	{ name: "Vinegar", sub: "Condiments & Cooking", sizes: ["500 ml"] },
	{ name: "Honey", sub: "Condiments & Cooking", sizes: ["250 g", "500 g"] },
	{ name: "Mixed Fruit Jam", sub: "Condiments & Cooking", sizes: ["500 g"] },
	{ name: "Papad (Dried)", sub: "Condiments & Cooking", sizes: ["200 g"] },
	{ name: "Pickle (Mixed)", sub: "Condiments & Cooking", sizes: ["500 g"] },
	// Breakfast & Packaged Staples
	{
		name: "Vermicelli (Seviyan)",
		sub: "Breakfast & Staples",
		sizes: ["400 g"],
	},
	{ name: "Macaroni", sub: "Breakfast & Staples", sizes: ["500 g"] },
	{
		name: "Oats (Plain)",
		sub: "Breakfast & Staples",
		sizes: ["500 g", "1 kg"],
	},
	{ name: "Cornflakes (Plain)", sub: "Breakfast & Staples", sizes: ["475 g"] },
	{ name: "Sabudana (Sago)", sub: "Breakfast & Staples", sizes: ["500 g"] },
	{
		name: "Dalia (Broken Wheat)",
		sub: "Breakfast & Staples",
		sizes: ["500 g"],
	},
	// Dairy (ambient / staples)
	{ name: "Milk Powder", sub: "Dairy", sizes: ["500 g"] },
	{ name: "Condensed Milk", sub: "Dairy", sizes: ["400 g"] },
	{ name: "Paneer (Fresh)", sub: "Dairy", sizes: ["200 g"] },
	{ name: "Butter (Table)", sub: "Dairy", sizes: ["100 g", "500 g"] },
	// Household staples kitchen
	{ name: "Matchbox (Pack)", sub: "Kitchen Essentials", sizes: ["10 pc"] },
	{ name: "Aluminium Foil", sub: "Kitchen Essentials", sizes: ["1 pc"] },
	{ name: "Paper Napkins", sub: "Kitchen Essentials", sizes: ["100 pc"] },
];

/** @type {Item[]} */
const snacks = [
	{ name: "Aloo Bhujia (Loose)", sub: "Namkeen", sizes: ["200 g", "500 g"] },
	{
		name: "Mixture Namkeen (Loose)",
		sub: "Namkeen",
		sizes: ["200 g", "500 g"],
	},
	{ name: "Salted Peanuts", sub: "Namkeen", sizes: ["200 g"] },
	{ name: "Roasted Chana", sub: "Namkeen", sizes: ["200 g"] },
	{ name: "Moong Dal Namkeen", sub: "Namkeen", sizes: ["200 g"] },
	{
		name: "Potato Chips (Salted)",
		sub: "Chips & Wafers",
		sizes: ["50 g", "150 g"],
	},
	{ name: "Banana Chips", sub: "Chips & Wafers", sizes: ["200 g"] },
	{ name: "Nachos", sub: "Chips & Wafers", sizes: ["150 g"] },
	{
		name: "Glucose Biscuits",
		sub: "Biscuits & Cookies",
		sizes: ["100 g", "250 g"],
	},
	{ name: "Marie Biscuits", sub: "Biscuits & Cookies", sizes: ["150 g"] },
	{ name: "Cream Biscuits", sub: "Biscuits & Cookies", sizes: ["100 g"] },
	{ name: "Salted Crackers", sub: "Biscuits & Cookies", sizes: ["100 g"] },
	{ name: "Digestive Biscuits", sub: "Biscuits & Cookies", sizes: ["250 g"] },
	{ name: "Instant Noodles (Masala)", sub: "Instant Foods", sizes: ["70 g"] },
	{ name: "Instant Soup (Veg)", sub: "Instant Foods", sizes: ["50 g"] },
	{ name: "Popcorn (Microwave)", sub: "Instant Foods", sizes: ["90 g"] },
	{ name: "Soda Water", sub: "Beverages", sizes: ["300 ml", "750 ml"] },
	{ name: "Packaged Drinking Water", sub: "Beverages", sizes: ["1 L"] },
	{ name: "Lemon Drink (Bottled)", sub: "Beverages", sizes: ["600 ml"] },
	{ name: "Mango Drink (Bottled)", sub: "Beverages", sizes: ["600 ml"] },
	{ name: "Orange Drink (Bottled)", sub: "Beverages", sizes: ["600 ml"] },
	{ name: "Energy Drink", sub: "Beverages", sizes: ["250 ml"] },
	{ name: "Coconut Water (Tetra)", sub: "Beverages", sizes: ["200 ml"] },
	{ name: "Buttermilk (Chaas)", sub: "Beverages", sizes: ["200 ml"] },
	{ name: "Fruit Juice (Mixed)", sub: "Beverages", sizes: ["1 L"] },
];

/** @type {Item[]} */
const sweets = [
	{ name: "Besan Ladoo", sub: "Indian Sweets", sizes: ["250 g", "500 g"] },
	{ name: "Motichoor Ladoo", sub: "Indian Sweets", sizes: ["250 g", "500 g"] },
	{ name: "Kaju Katli", sub: "Indian Sweets", sizes: ["250 g", "500 g"] },
	{ name: "Gulab Jamun", sub: "Indian Sweets", sizes: ["500 g", "1 kg"] },
	{ name: "Rasgulla", sub: "Indian Sweets", sizes: ["500 g", "1 kg"] },
	{ name: "Soan Papdi", sub: "Indian Sweets", sizes: ["250 g", "500 g"] },
	{ name: "Jalebi", sub: "Indian Sweets", sizes: ["250 g", "500 g"] },
	{ name: "Barfi (Plain)", sub: "Indian Sweets", sizes: ["250 g", "500 g"] },
	{ name: "Peda", sub: "Indian Sweets", sizes: ["250 g"] },
	{ name: "Mysore Pak", sub: "Indian Sweets", sizes: ["250 g"] },
	{ name: "Bread (Loaf)", sub: "Bakery", sizes: ["400 g"] },
	{ name: "Brown Bread (Loaf)", sub: "Bakery", sizes: ["400 g"] },
	{ name: "Pav (Buns)", sub: "Bakery", sizes: ["6 pc"] },
	{ name: "Bun (Sweet)", sub: "Bakery", sizes: ["4 pc"] },
	{ name: "Rusk / Toast", sub: "Bakery", sizes: ["300 g"] },
	{ name: "Khari (Puff Biscuit)", sub: "Bakery", sizes: ["200 g"] },
	{ name: "Cake Rusk", sub: "Bakery", sizes: ["300 g"] },
	{ name: "Fruit Cake (Slice)", sub: "Bakery", sizes: ["250 g"] },
	{ name: "Cookies (Butter)", sub: "Bakery", sizes: ["200 g"] },
	{ name: "Muffins", sub: "Bakery", sizes: ["4 pc"] },
];

/** @type {Item[]} */
const personalCare = [
	{ name: "Bathing Soap", sub: "Bath & Body", sizes: ["100 g"] },
	{ name: "Herbal Bathing Soap", sub: "Bath & Body", sizes: ["100 g"] },
	{ name: "Hand Wash (Refill)", sub: "Bath & Body", sizes: ["200 ml"] },
	{ name: "Body Lotion", sub: "Bath & Body", sizes: ["100 ml", "200 ml"] },
	{ name: "Talcum Powder", sub: "Bath & Body", sizes: ["100 g"] },
	{ name: "Shampoo (Bottle)", sub: "Hair Care", sizes: ["180 ml"] },
	{ name: "Shampoo Sachet", sub: "Hair Care", sizes: ["6 ml"] },
	{ name: "Hair Oil (Coconut)", sub: "Hair Care", sizes: ["100 ml", "200 ml"] },
	{ name: "Hair Oil (Amla)", sub: "Hair Care", sizes: ["100 ml"] },
	{ name: "Toothpaste", sub: "Oral Care", sizes: ["100 g", "200 g"] },
	{ name: "Toothbrush", sub: "Oral Care", sizes: ["1 pc"] },
	{ name: "Tooth Powder", sub: "Oral Care", sizes: ["100 g"] },
	{ name: "Shaving Cream", sub: "Grooming", sizes: ["70 g"] },
	{ name: "Shaving Razor", sub: "Grooming", sizes: ["1 pc"] },
	{ name: "Face Wash", sub: "Skin Care", sizes: ["50 g", "100 g"] },
	{ name: "Cold Cream", sub: "Skin Care", sizes: ["100 ml"] },
	{ name: "Deodorant Spray", sub: "Grooming", sizes: ["150 ml"] },
	{ name: "Sanitary Pads (Pack)", sub: "Feminine Care", sizes: ["8 pc"] },
	{ name: "Facial Tissue (Box)", sub: "Skin Care", sizes: ["100 pc"] },
	{ name: "Cotton (Roll)", sub: "Skin Care", sizes: ["50 g"] },
];

/** @type {Item[]} */
const household = [
	{ name: "Detergent Powder", sub: "Laundry", sizes: ["1 kg"] },
	{ name: "Detergent Bar", sub: "Laundry", sizes: ["1 pc"] },
	{ name: "Liquid Detergent", sub: "Laundry", sizes: ["1 L"] },
	{ name: "Fabric Softener", sub: "Laundry", sizes: ["500 ml"] },
	{ name: "Dishwash Bar", sub: "Dishwashing", sizes: ["1 pc"] },
	{ name: "Dishwash Liquid", sub: "Dishwashing", sizes: ["500 ml"] },
	{ name: "Scrub Pad", sub: "Dishwashing", sizes: ["1 pc"] },
	{ name: "Floor Cleaner", sub: "Surface Cleaning", sizes: ["500 ml", "1 L"] },
	{ name: "Toilet Cleaner", sub: "Surface Cleaning", sizes: ["500 ml"] },
	{ name: "Glass Cleaner", sub: "Surface Cleaning", sizes: ["500 ml"] },
	{ name: "Phenyl (White)", sub: "Surface Cleaning", sizes: ["500 ml", "1 L"] },
	{ name: "Bleaching Powder", sub: "Surface Cleaning", sizes: ["500 g"] },
	{ name: "Room Freshener", sub: "Air Care", sizes: ["200 ml"] },
	{ name: "Mosquito Repellent Coil", sub: "Pest Control", sizes: ["10 pc"] },
	{ name: "Mosquito Repellent Liquid", sub: "Pest Control", sizes: ["45 ml"] },
	{ name: "Garbage Bags (Medium)", sub: "Disposables", sizes: ["30 pc"] },
	{ name: "Broom (Soft)", sub: "Cleaning Tools", sizes: ["1 pc"] },
	{ name: "Floor Wiper", sub: "Cleaning Tools", sizes: ["1 pc"] },
	{ name: "Bucket (Plastic)", sub: "Cleaning Tools", sizes: ["1 pc"] },
	{ name: "Handwash Soap Bar", sub: "Hand Hygiene", sizes: ["75 g"] },
];

export const PACKS = [
	{
		slug: "grocery-essentials",
		name: "Grocery Essentials",
		description:
			"Everyday kitchen staples — pulses, rice, atta, oils, spices and more. A strong starting catalogue for a kirana or supermarket.",
		category: G,
		sortOrder: 1,
		items: grocery,
	},
	{
		slug: "snacks-and-beverages",
		name: "Snacks & Beverages",
		description: "Namkeen, biscuits, chips, instant foods and packaged drinks.",
		category: "Snacks & Beverages",
		sortOrder: 2,
		items: snacks,
	},
	{
		slug: "sweets-and-bakery",
		name: "Sweets & Bakery",
		description: "Popular Indian sweets plus everyday bakery items.",
		category: "Sweets & Bakery",
		sortOrder: 3,
		items: sweets,
	},
	{
		slug: "personal-care",
		name: "Personal Care",
		description: "Bath, hair, oral and skin care daily essentials.",
		category: "Personal Care",
		sortOrder: 4,
		items: personalCare,
	},
	{
		slug: "household-cleaning",
		name: "Household Cleaning",
		description: "Laundry, dishwashing, surface cleaning and home care.",
		category: "Household Cleaning",
		sortOrder: 5,
		items: household,
	},
];

/** Infer a coarse unit kind from a pack-size string. */
export function unitKind(size) {
	const s = size.toLowerCase();
	if (/\bkg\b|\bg\b/.test(s)) return "weight";
	if (/\bml\b|\bl\b/.test(s)) return "volume";
	if (/\bpc\b/.test(s)) return "piece";
	return "unit";
}

export function slugify(s) {
	return s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

/** Expand the packs into flat master-product rows with stable codes. */
export function expandMasterRows() {
	/** @type {{code:string,name:string,category:string,subcategory:string,packSize:string,unit:string,variantLabel:string,packSlug:string,position:number}[]} */
	const rows = [];
	for (const pack of PACKS) {
		let pos = 0;
		for (const item of pack.items) {
			for (const size of item.sizes) {
				const code = `${pack.slug}:${slugify(item.name)}:${slugify(size)}`;
				rows.push({
					code,
					name: item.name,
					category: pack.category,
					subcategory: item.sub,
					packSize: size,
					unit: unitKind(size),
					variantLabel: size,
					packSlug: pack.slug,
					position: pos++,
				});
			}
		}
	}
	return rows;
}
