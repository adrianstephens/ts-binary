import { UpTo52, Adapter } from '../common';
export const isLittleEndian = (new Uint8Array(new Uint16Array([0x1234]).buffer))[0] === 0x34;

//-----------------------------------------------------------------------------
// bitfields
//-----------------------------------------------------------------------------

export type BitInput<N>	= number extends N ? number | bigint : N extends 0 ? number | bigint : N extends UpTo52 ? number : bigint;
export type BitOutput<T>	= T extends number ? (T extends UpTo52 ? number : number extends T ? number | bigint : bigint)
	: T extends BitAdapterN<any, infer D> ? D
	: T extends object ? { [K in keyof T]: BitOutput<T[K]> }
	: never;

export type BitFieldDescriptor =
    | number
    | BitAdapterN<any, any>
    | BitFieldDescriptorObject
    | BitFieldDescriptorArray
    | BitFieldDescriptorAdapter<any, any>;

interface BitFieldDescriptorObject { [K: string]: BitFieldDescriptor }
interface BitFieldDescriptorArray extends ReadonlyArray<BitFieldDescriptor> {}
export interface BitFieldDescriptorAdapter<T extends BitFieldDescriptor, D> extends Adapter<BitOutput<T>, D> { descriptor: T; }

export interface BitAdapter<T extends number|bigint, D> extends Adapter<T, D> {
	bits: number;
}
export interface BitAdapterN<N extends number, D> extends Adapter<BitInput<N>, D> {
	bits: N;
}

export function BitField<N extends number, T>(bits: N, adapter: Adapter<BitInput<N>, T>, be = false, fixedOffset?: number): BitAdapterN<N, T> {
	return { bits, ...adapter};
}

export function BitChain<T extends number|bigint, D, F>(base: BitAdapter<T, D>, adapter: Adapter<D, F>): BitAdapter<T, F> {
	return {
		bits: base.bits,
		to:(x: T)			=> adapter.to(base.to(x)),
		from:(x: F)			=> base.from(adapter.from(x)),
	};
}

export function BitFieldChain<D extends BitFieldDescriptor, F>(base: D, adapter: Adapter<BitOutput<D>, F>): BitFieldDescriptorAdapter<D, F> {
	return {...adapter, descriptor: base};
}

export function BitAdapterUnsigned<N extends number>(bits: N): BitAdapter<BitInput<N>, BitInput<N>> {
	type T = BitInput<N>;
	return bits > 32 && bits <= 52
		? {
			bits,
			to:(x: T)			=> Number(x) as T,
			from:(x: T)			=> BigInt(x) as T,
		} : {
			bits,
			to:(x: any)			=> x,
			from:(x: any)		=> x,
		};
}

export function BitAdapterSigned<N extends number>(bits: N): BitAdapter<BitInput<N>, BitInput<N>> {
	type T = BitInput<N>;
	let from = (x: T) => x, to: (x: T) => T;
	if (bits > 52) {
		const m	= 1n << BigInt(bits - 1);
		to		= x => ((x as bigint) & (m - 1n)) - ((x as bigint) & m) as T;
	} else if (bits > 32) {
		const m	= 2 ** (bits - 1);
		to		= x => { const y = Number(x); return (y >= m ? y - 2 * m : y) as T; };
		from	= x	=> BigInt(x) as T;
	} else {
		const m	= 1 << (bits - 1);
		to		= x => (x & (m - 1)) - (x & m) as T;
	}
	return {bits, from, to};
}
export function calcBits(desc: BitFieldDescriptor) {
	if (typeof desc === 'number')
		return desc < 0 ? -desc : desc;

	if ('descriptor' in desc)
		return calcBits(desc.descriptor);

	const a = desc as BitAdapterN<any, any>;
	if (typeof a.bits === 'number')
		return a.bits;

	let total = 0;
	for (const key in desc)
		total += calcBits((desc as any)[key]);
	return total;
}

export function BitFields<N extends number, T extends BitFieldDescriptor>(bits: N, desc: T): BitAdapterN<N, BitOutput<T>> {
	const total = calcBits(desc);
	if (bits === 0)
		bits = total as N;
	else if (bits < total)
		throw new Error(`BitFields: total bits of fields (${total}) exceed specified bits (${bits})`);

	if (typeof desc === 'number')
		return (desc < 0 ? BitAdapterSigned(-desc) : BitAdapterUnsigned(desc)) as unknown as BitAdapterN<N, BitOutput<T>>;
	
	const a = desc as BitAdapterN<any, any>;
	if (typeof a.bits === 'number')
		return BitChain(BitAdapterUnsigned(a.bits), a) as BitAdapterN<N, BitOutput<T>>;

	const bitfields:	Record<string, BitAdapterN<any, any>> = {};
	let offset = 0;
	for (const key in desc) {
		const value		= desc[key] as any;
		const adapter	= typeof value === 'number' ? BitAdapterUnsigned(value)
						: typeof value.bits === 'number' ? value as BitAdapterN<any, any>
						: BitFields(0, value as any);
		bitfields[key] = adapter;
		offset += adapter.bits;
	}

	if (bits > 32) {
		return {
			bits,
			to: (x: number|bigint) => {
				let y = BigInt(x);
				const obj = /*isArray ? [] as any : */{} as Record<string, any>;
				for (const i in bitfields) {
					const bf	= bitfields[i];
					const bits	= bf.bits;
					const v		= y & ((1n << BigInt(bits)) - 1n);
					obj[i] = bf.to(bits <= 52 ? Number(v) : v);
					y >>= BigInt(bits);
				}
				return obj as any;
			},
			from: (obj: Record<string, any>) => {
				let x	= 0n;
				let bit = 0;
				for (const i in bitfields) {
					const bf	= bitfields[i];
					const bits	= bf.bits;
					x	|= (BigInt(bf.from(obj[i])) & ((1n << BigInt(bits)) - 1n)) << BigInt(bit);
					bit	+= bits;
				}
				return (bits <= 52 ? Number(x) : x) as BitInput<N>;
			}
		};
	} else {
		return {
			bits,
			to: (x: number|bigint) => {
				const obj = /*isArray ? [] as any :*/ {} as Record<string, any>;
				let y = Number(x);
				for (const i in bitfields) {
					const bf	= bitfields[i];
					const bits	= bf.bits;
					obj[i] = bf.to(y & ((1 << bits) - 1));
					y >>= bits;
				}
				return obj as any;
			},
			from: (obj: Record<string, any>) => {
				let x	= 0;
				let bit = 0;
				for (const i in bitfields) {
					const bf	= bitfields[i];
					const bits	= bf.bits;
					x	|= (Number(bf.from(obj[i])) & ((1 << bits) - 1)) << bit;
					bit	+= bits;
				}
				return x as BitInput<N>;
			}
		};
	}
}

export function BitArray<C extends number, N extends number>(count: C, bits: N, be = false): BitAdapter<bigint, BitInput<N>[]> {
	const mask = (1n << BigInt(bits)) - 1n;
	return {
		bits: count * bits,
		to(v: number|bigint) {
			let x = BigInt(v);
			return new Proxy({}, {
				get(_target, prop) {
					if (prop === 'length')
						return count;
					const index = typeof prop === 'string' ? Number(prop) : NaN;
					if (!isNaN(index) && index >= 0 && index < count) {
						const v = (x >> BigInt(index * bits)) & mask;
						return bits <= 52 ? Number(v) : v;
					}
					return undefined;
				},
				set(_target, prop, value) {
					const index = typeof prop === 'string' ? Number(prop) : NaN;
					if (!isNaN(index) && index >= 0 && index < count) {
						const v = (BigInt(value) & mask) << BigInt(index * bits);
						x = (x & ~(mask << BigInt(index * bits))) | v;
						return true;
					}
					return false;
				}
			}) as BitInput<N>[];
		},
		from(array:  BitInput<N>[]) {
			let x	= 0n;
			for (let i = 0; i < count; i++)
				x |= (BigInt(array[i]) & mask) << BigInt(i * bits);
			return x;
		}
	};
}
