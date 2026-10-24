import { vi } from "vitest";

/**
 * Minimal chainable Supabase client stub for unit tests. It records insert /
 * update / upsert / rpc calls and resolves reads from a supplied responder, so
 * we can assert service behaviour (e.g. "selecting a plan never activates
 * entitlements") without a live database.
 */
export interface MockCall {
	table?: string;
	op: "select" | "update" | "insert" | "upsert" | "rpc";
	payload?: unknown;
	filters?: Record<string, unknown>;
	fn?: string;
	args?: unknown;
}

type ReadResponder = (ctx: {
	table: string;
	filters: Record<string, unknown>;
}) => { data: unknown; error: unknown; count?: number };

export function createSupabaseMock(options: {
	read?: ReadResponder;
	rpc?: (fn: string, args: unknown) => { data: unknown; error: unknown };
}) {
	const calls: MockCall[] = [];
	const read = options.read ?? (() => ({ data: null, error: null }));

	class Builder {
		op: MockCall["op"] = "select";
		filters: Record<string, unknown> = {};
		payload: unknown;
		constructor(private table: string) {}
		select() {
			this.op = "select";
			return this;
		}
		update(p: unknown) {
			this.op = "update";
			this.payload = p;
			return this;
		}
		insert(p: unknown) {
			this.op = "insert";
			this.payload = p;
			calls.push({ table: this.table, op: "insert", payload: p });
			return this;
		}
		upsert(p: unknown) {
			this.op = "upsert";
			this.payload = p;
			calls.push({ table: this.table, op: "upsert", payload: p });
			return this;
		}
		eq(k: string, v: unknown) {
			this.filters[k] = v;
			return this;
		}
		order() {
			return this;
		}
		limit() {
			return this;
		}
		private resolve() {
			if (this.op === "update") {
				calls.push({
					table: this.table,
					op: "update",
					payload: this.payload,
					filters: this.filters,
				});
				return { data: null, error: null };
			}
			if (this.op === "insert" || this.op === "upsert") {
				return { data: null, error: null };
			}
			return read({ table: this.table, filters: this.filters });
		}
		maybeSingle() {
			return Promise.resolve(this.resolve());
		}
		single() {
			return Promise.resolve(this.resolve());
		}
		then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
			return Promise.resolve(this.resolve()).then(onF, onR);
		}
	}

	const client = {
		from: vi.fn((table: string) => new Builder(table)),
		rpc: vi.fn((fn: string, args: unknown) => {
			calls.push({ op: "rpc", fn, args });
			const r = options.rpc?.(fn, args) ?? { data: null, error: null };
			return Promise.resolve(r);
		}),
	};

	return { client, calls };
}
