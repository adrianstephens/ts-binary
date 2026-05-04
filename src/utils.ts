export type UpTo8 = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type UpTo16 = UpTo8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16;
export type UpTo32 = UpTo16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28 | 29 | 30 | 31 | 32;
export type UpTo52 = UpTo32 | 33 | 34 | 35 | 36 | 37 | 38 | 39 | 40 | 41 | 42 | 43 | 44 | 45 | 46 | 47 | 48 | 49 | 50 | 51 | 52;
export type UpTo56 = UpTo52 | 53 | 54 | 55 | 56;

//type TupleOf<N extends number, T extends unknown[] = []> = T['length'] extends N ? T : TupleOf<N, [...T, unknown]>;
//type Mod8Tuple<T extends unknown[]> = T extends [unknown, unknown, unknown, unknown, unknown, unknown, unknown, unknown, ...infer R] ? Mod8Tuple<R> : T['length'];
//export type IsMultipleOf8<N extends number> = number extends N ? boolean : Mod8Tuple<TupleOf<N>> extends 0 ? true : false;

type IntRange<N extends number, T extends number[] = []> = T['length'] extends N ? T[number] : IntRange<N, [...T, T['length']]>;
type Pow2<N extends number, T extends unknown[] = [0], I extends unknown[] = []> = I['length'] extends N ? T['length'] : Pow2<N, [...T, ...T], [...I, 0]>;
//type Gt<A extends number, B extends number, T extends unknown[] = []> = T['length'] extends B ? (T['length'] extends A ? false : true) : T['length'] extends A ? false : Gt<A, B, [...T, 0]>;
export type BitsType<N extends number> = number extends N ? number : N extends UpTo8 ? IntRange<Pow2<N>> : N extends UpTo32 ? number : bigint;

type Pow2Number = 0x1 | 0x2 | 0x4 | 0x8 | 0x10 | 0x20 | 0x40 | 0x80
	| 0x100 | 0x200 | 0x400 | 0x800 | 0x1000 | 0x2000 | 0x4000 | 0x8000
	| 0x10000 | 0x20000 | 0x40000 | 0x80000 | 0x100000 | 0x200000 | 0x400000 | 0x800000
	| 0x1000000 | 0x2000000 | 0x4000000 | 0x8000000 | 0x10000000 | 0x20000000 | 0x40000000 | 0x80000000
	| 0x100000000 | 0x200000000 | 0x400000000 | 0x800000000 | 0x1000000000 | 0x2000000000 | 0x4000000000 | 0x8000000000
	| 0x10000000000 | 0x20000000000 | 0x40000000000 | 0x80000000000 | 0x100000000000 | 0x200000000000 | 0x400000000000 | 0x800000000000
	| 0x1000000000000 | 0x2000000000000 | 0x4000000000000 | 0x8000000000000 | 0x10000000000000;

export type IsPow2<V> = V extends bigint ? (`${V}` extends `${infer N}n` ? N extends `${Pow2Number}` ? true : false : false) : V extends Pow2Number ? true : false;

// Helper to generate all bit combinations
export type BitCombinations<T extends number, Acc extends number = 0> =
	[T] extends [never]
		? Acc
		: T extends T
			? BitCombinations<Exclude<T, T>, Acc | T | (Acc | T)>
			: never;


function compare<T extends number|bigint|string>(a: T, b: T): number {
	return a === b ? 0 : a > b ? 1 : -1;
}

export class KMP {
	failure: Uint8Array;
	j = 0;
	
	constructor(public pattern: Uint8Array) {
		// Build failure function
		const f = new Uint8Array(pattern.length);
		for (let i = 1, j = 0; i < pattern.length; i++) {
			while (j > 0 && pattern[i] !== pattern[j])
				j = f[j - 1];
			if (pattern[i] === pattern[j])
				j++;
			f[i] = j;
		}
		this.failure = f;
	}

	search(data: Uint8Array, start = 0) {
		const f = this.failure;
		const p = this.pattern;
		let j = this.j, pos = start;

		for (let i = start; i < data.length; i++) {
			const byte = data[i];
			while (j > 0 && byte !== p[j])
				j = f[j - 1];
			if (byte === p[j])
				j++;
			pos++;
			if (j === p.length) {
				//yield pos - p.length; // match offset
				j = f[j - 1];
				return pos - p.length;
			}
		}
		this.j = j;
		return -1;
	}

}

//-----------------------------------------------------------------------------
//	bit stuff
//-----------------------------------------------------------------------------

export const isLittleEndian = (new Uint8Array(new Uint16Array([0x1234]).buffer))[0] === 0x34;

export function isPow2(n: number) {
	return (n & (n - 1)) === 0;
}
export function contiguousBits(n: number) {
	return isPow2(n + lowestSet(n));
}


export function nextPow2(n: number): number;
export function nextPow2(n: bigint): number;
export function nextPow2(n: number|bigint) {
	return typeof n === 'bigint'
		? 1n << (BigInt(highestSetIndex(n - 1n) + 1))
		: 1 << (highestSetIndex(n - 1) + 1);
}

export function lowestSet(n: number): number;
export function lowestSet(n: bigint): bigint;
export function lowestSet(n: number | bigint): number | bigint;
export function lowestSet(n: number | bigint): number | bigint {
	return typeof n === 'bigint' ? n & -n : n & -n;
}

export function highestSetIndex(n: number | bigint): number {
	return	n < 2 ** 32				? bits32(Number(n))
		:	n < Number.MAX_VALUE	? bits1024(Number(n))
		:	big(BigInt(n));

	function bits32(n: number) {
		return 31 - Math.clz32(n);
	}

	function bits1024(x: number): number {
		const b = Math.floor(Math.log2(x));
		return 1n << BigInt(b) <= x ? b : b - 1;
	}

	function big(n: bigint) {
		let s = 0;
		let k = 0;

		for (let t = n >> 1024n; t; t >>= BigInt(s)) {
			s = 1024 << k++;
			n = t;
		}

		if (k) {
			while (--k) {
				const b = n >> BigInt(512 << k);
				if (b) {
					s += 512 << k;
					n = b;
				}
			}
		}

		return bits1024(Number(n)) + s;
	}
}

export function lowestSetIndex(n: number | bigint): number {
	return highestSetIndex(lowestSet(n));
}

export function clearLowest(n: number): number;
export function clearLowest(n: bigint): bigint;
export function clearLowest(n: number | bigint): number | bigint;
export function clearLowest(n: number | bigint)	{
	return typeof n === 'bigint'
		? n & (n - 1n)
		: n & (n - 1);
}

export function bitCount(x: number | bigint): number {
	if (x < 0)
		x = ~x;
	if (x < 0x100000000) {
		x = Number(x);
		x = x - ((x >> 1) & 0x55555555);
		x = (x & 0x33333333) + ((x >> 2) & 0x33333333);
		return ((x + (x >> 4) & 0xF0F0F0F) * 0x1010101) >> 24;
	}

	x = BigInt(x);
	let k = 5;
	for (let t = x >> 32n; t;)
		t >>= BigInt(1 << k++);

	const n			= 1 << k;
	const limit		= 1n << BigInt(n);

	let s = 1;
	for (; s < k; s <<= 1) {
		const bi	= BigInt(s);
		const mask	= limit / ((1n << bi) + 1n);
		x = (x & mask) + ((x >> bi) & mask);
	}

	//we can add the rest with a multiply and shift (which turns out to be slower)
	//const mask = limit / ((1n << bi) - 1n);
	//x = (x * mask) >> BigInt(n - i);

	//we can skip the masking when the total can fit
	for (; s < n; s <<= 1)
		x += x >> BigInt(s);

	return Number(x & ((1n << BigInt(k)) - 1n));
}

export function bitReverse<N extends number>(x: number | bigint, bits: N): N extends UpTo32 ? number : number|bigint {
	type	R		= N extends UpTo32 ? number : bigint;
	let		n		= 1 << (32 - Math.clz32(bits - 1));	// next power of 2 >= bits
	const	shift	= n - bits;

	if (bits <= 32) {
		let		mask	= (2 ** n) - 1;
		x = typeof x === 'bigint' ? Number(x & BigInt(mask)) : x & mask;

		while ((n >>= 1)) {
			mask ^= mask << n;
			x = ((x >> n) & mask) | ((x & mask) << n);
		}
		return (x >> shift) as R;
		
	} else {
		let		mask	= (1n << BigInt(n)) - 1n;
		x = BigInt(x) & mask;

		while ((n >>= 1)) {
			const nb = BigInt(n);
			mask ^= mask << nb;
			x = ((x >> nb) & mask) | ((x & mask) << nb);
		}
		return (x >> BigInt(shift)) as R;
	}
}

//-----------------------------------------------------------------------------
// adapter
//-----------------------------------------------------------------------------

interface Adapter<T, D> {
	to(x: T):	D;
	from(x: D):	T;
}

interface MutableArrayLike<T> {
    readonly length: number;
    [n: number]: T;
}
export function AdaptArray<T, D>(array: MutableArrayLike<T>, adapter: Adapter<T, D>): MutableArrayLike<D> {
	return new Proxy(array, {
		get(target, prop) {
			if (prop === 'length')
				return target.length;
			const index = typeof prop === 'string' ? Number(prop) : NaN;
			if (!isNaN(index) && index >= 0 && index < target.length)
				return adapter.to(target[index]);
			return undefined;
		},
		set(target, prop, value: D) {
			const index = typeof prop === 'string' ? Number(prop) : NaN;
			if (!isNaN(index) && index >= 0 && index < target.length) {
				target[index] = adapter.from(value);
				return true;
			}
			return false;
		}
	}) as unknown as MutableArrayLike<D>;
}

//-----------------------------------------------------------------------------
// bitfields
//-----------------------------------------------------------------------------

type BitInput<N>	= number extends N ? number | bigint : N extends 0 ? number | bigint : N extends UpTo52 ? number : bigint;
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
interface BitFieldDescriptorAdapter<T extends BitFieldDescriptor, D> extends Adapter<BitOutput<T>, D> { descriptor: T; }

export interface BitViewer<T> {
	get(dv: DataView, offset: number): T;
	set(dv: DataView, offset: number, v: T): void;
}

export interface BitAdapter<T extends number|bigint, D> extends Adapter<T, D> {
	bits: number;
}
export interface BitAdapterN<N extends number, D> extends Adapter<BitInput<N>, D> {
	bits: N;
}

export function BitField<N extends number, T>(bits: N, adapter: Adapter<BitInput<N>, T>, be = false, fixedOffset?: number): BitAdapterN<N, T> {
	return { bits, ...adapter};
}
/*
export function BitFieldView<N extends number, T>(bits: N, adapter: Adapter<BitInput<N>, T>, be = false, fixedOffset?: number): BitViewer<T> {
	const getter = bitsView(bits, !be, fixedOffset);
	return {
		get(dv, offset)			{ return adapter.to(getter.get(dv, offset) as BitInput<N>); },
		set(dv, offset, v: T)	{ getter.set(dv, offset, adapter.from(v)); },
	 };
}
*/
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

/*
export function BitViewerChain<D, F>(base: BitViewer<D>, adapter: Adapter<D, F>): BitViewer<F>;
export function BitViewerChain<D extends BitFieldDescriptor, F>(base: D, adapter: Adapter<BitOutput<D>, F>): BitViewer<F>;
export function BitViewerChain<D, F>(base: BitViewer<D> | BitFieldDescriptor, adapter: Adapter<D, F>): BitViewer<F> {
    const viewer = typeof base === 'object' && 'get' in base ? base as BitViewer<D> : BitFieldsViewer(base) as BitViewer<D>;
    return {
        get:(dv, offset)    => adapter.to(viewer.get(dv, offset)),
        set:(dv, offset, w) => viewer.set(dv, offset, adapter.from(w))
    };
}

export function BitViewerChain<D, F>(base: BitViewer<D>, adapter: Adapter<D, F>): BitViewer<F> {
	return {
		get:(dv, offset)	=> adapter.to(base.get(dv, offset)),
		set:(dv, offset, w)	=> base.set(dv, offset, adapter.from(w))
	};
}

export function BitViewerChain<D extends BitFieldDescriptor, F>(base: D, adapter: Adapter<BitOutput<D>, F>): BitViewer<F> {
	const viewer = BitFieldsViewer(base);
	return {
		get:(dv, offset)	=> adapter.to(viewer.get(dv, offset)),
		set:(dv, offset, w)	=> viewer.set(dv, offset, adapter.from(w))
	};
}
*/

function BitAdapterUnsigned<N extends number>(bits: N): BitAdapter<BitInput<N>, BitInput<N>> {
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

function BitAdapterSigned<N extends number>(bits: N): BitAdapter<BitInput<N>, BitInput<N>> {
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
function calcBits(desc: BitFieldDescriptor) {
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


function BitViewerUnsigned<N extends number>(bits: N, be = false, fixedOffset?: number): BitViewer<BitInput<N>> {
	type T = BitInput<N>;
	const getter = bitsView(bits, !be, fixedOffset);
	return bits > 32 && bits <= 52
		? {
			get:(dv, offset)	=> getter.get(dv, offset) as T,
			set:(dv, offset, v)	=> getter.set(dv, offset, BigInt(v)),
		} : {
			get:(dv, offset)	=> getter.get(dv, offset) as T,
			set:(dv, offset, v)	=> getter.set(dv, offset, v),
		};
}

function BitViewerSigned<N extends number>(bits: N, be = false, fixedOffset?: number): BitViewer<BitInput<N>> {
	const a = BitAdapterSigned(bits);
	const getter = bitsView(bits, !be, fixedOffset);
	return {
		get: (dv, offset)		=> a.to(getter.get(dv, offset) as BitInput<N>),
		set: (dv, offset, v)	=> getter.set(dv, offset, v)
	};
}

export function BitFieldsViewer<T extends BitFieldDescriptor>(desc: T, be = false, fixedOffset?: number): BitViewer<BitOutput<T>> {
	if (typeof desc === 'number')
		return (desc < 0 ? BitViewerSigned(-desc, be, fixedOffset) : BitViewerUnsigned(desc, be, fixedOffset)) as BitViewer<BitOutput<T>>;

	const b = desc as BitFieldDescriptorAdapter<any, any>;
	if (b.descriptor) {
	    const viewer = BitFieldsViewer(b.descriptor);
		return {
			get: (dv, offset)		=> b.to(viewer.get(dv, offset)),
			set: (dv, offset, w)	=> viewer.set(dv, offset, b.from(w))
		};
	}
	
	const a = desc as BitAdapterN<any, any>;
	if (typeof a.bits === 'number') {
	    const viewer = BitViewerUnsigned(a.bits, be, fixedOffset);
		return {
			get: (dv, offset)		=> a.to(viewer.get(dv, offset)),
			set: (dv, offset, w)	=> viewer.set(dv, offset, a.from(w))
		};
	}

	const	props: PropertyDescriptorMap = {};
	let		offset = 0;
	for (const key in desc) {
		const value		= desc[key] as any;
		const viewer	= BitFieldsViewer(value, be, fixedOffset !== undefined ? fixedOffset + offset : undefined);

		const localOffset = offset;
		props[key] = {
			enumerable: true,
			get(this: any)				{ return viewer.get(this.__dv, this.__offset + localOffset); },
			set(this: any, value: any)	{ viewer.set(this.__dv, this.__offset + localOffset, value); }
		}

		offset += calcBits(value);
	}

	const proto = Object.create(null);
	Object.defineProperties(proto, props);

	const get = (dv: DataView, offset: number) => {
		const result = Object.create(proto);
		Object.defineProperty(result, '__dv', {value: dv, enumerable: false, writable: false});
		Object.defineProperty(result, '__offset', {value: offset, enumerable: false, writable: false});
		return result;
	};

	return {
		get,
		set(dv: DataView, offset: number, v: any) {//BitsOutput<T>) {
			const result = get(dv, offset);
			for (const i in v)
				result[i] = v[i];
		}
	};
}

export function BitArrayViewer<C extends number, N extends number>(count: C, bits: N, be = false): BitViewer<BitInput<N>[]> {
	const getter = bitsView(bits, !be);
	return {
		get(dv: DataView, offset: number) {
			return new Proxy({}, {
				get(_target, prop) {
					if (prop === 'length')
						return count;
					const index = typeof prop === 'string' ? Number(prop) : NaN;
					if (!isNaN(index) && index >= 0 && index < count)
						return getter.get(dv, offset + index * bits);
					return undefined;
				},
				set(_target, prop, value) {
					const index = typeof prop === 'string' ? Number(prop) : NaN;
					if (!isNaN(index) && index >= 0 && index < count) {
						getter.set(dv, offset + index * bits, value);
						return true;
					}
					return false;
				}
			}) as BitInput<N>[];
		},
		set(dv: DataView, offset: number, v: BitInput<N>[]) {
			for (let i = 0; i < count; i++)
				getter.set(dv, offset + i * bits, v[i]);
		}
	};
}

//-----------------------------------------------------------------------------
//	integers
//-----------------------------------------------------------------------------

export function toSigned(n: number, bits: number) {
	const m = 1 << (bits - 1);
	return (n & (m - 1)) - (n & m);
}
export function toSignedBig(n: bigint, bits: number) {
	const m = 1n << BigInt(bits - 1);
	return (n & (m - 1n)) - (n & m);
}


export function isqrt(n: bigint) {
	if (n < 2n)
		return n;
	let x = 1n << BigInt((highestSetIndex(n) + 2) >> 1), y;
	while ((y = (x + n / x) >> 1n) < x)
		x = y;
	return x;
}

// get/put 1-7 byte integers from/to DataView (truncates to 52 bits)

export function getUint(dv: DataView, offset: number, len: number, littleEndian?: boolean) {
	let result = 0;
	if (littleEndian) {
		if (len & 1)
			result = dv.getUint8(offset + (len & 6));
		if (len & 2)
			result = (result << 16) | dv.getUint16(offset + (len & 4), true);
		if (len & 4)
			result = (result & 0x0fffff) * (2**32) + dv.getUint32(offset, true);
	} else {
		if (len & 1)
			result = dv.getUint8(offset);
		if (len & 2)
			result = (result << 16) | dv.getUint16(offset + (len & 1), false);
		if (len & 4)
			result = (result & 0x0fffff) * (2**32) + dv.getUint32(offset + (len & 3), false);
	}
	return result;
}

export function putUint(dv: DataView, offset: number, v: number, len: number, littleEndian?: boolean) {
	if (littleEndian) {
		if (len & 4) {
			dv.setUint32(offset, v & 0xffffffff, true);
			v = Math.floor(v / 2**32);
		}
		if (len & 2) {
			dv.setUint16(offset + (len & 4), v & 0xffff, true);
			v >>= 16;
		}
		if (len & 1)
			dv.setUint8(offset + (len & 6), v & 0xff);
	} else {
		if (len & 4) {
			dv.setUint32(offset + (len & 3), v & 0xffffffff);
			v = Math.floor(v / 2**32);
		}
		if (len & 2) {
			dv.setUint16(offset + (len & 1), v & 0xffff);
			v >>= 16;
		}
		if (len & 1)
			dv.setUint8(offset, v & 0xff);
	}
}

export function getBigUint(dv: DataView, offset: number, len: number, littleEndian?: boolean) {
	let result = 0n;
	if (littleEndian) {
		while (len >= 7) {
			len -= 4;
			result = (result << 32n) | BigInt(dv.getUint32(offset + len, true));
		}
		return (result << BigInt(len * 8)) + BigInt(getUint(dv, offset, len, true));
	} else {
		const end = offset + len;
		while (offset + 7 <= end) {
			result = (result << 32n) | BigInt(dv.getUint32(offset));
			offset += 4;
		}
		return (result << BigInt((end - offset) * 8)) + BigInt(getUint(dv, offset, end - offset));
	}
}

export function putBigUint(dv: DataView, offset: number, v: bigint, len: number, littleEndian?: boolean) {
	if (littleEndian) {
		const end = offset + len;
		while (offset + 7 <= end) {
			dv.setUint32(offset, Number(v & 0xffffffffn), true);
			v >>= 32n;
			offset += 4;
		}
		putUint(dv, offset, Number(v), end - offset, true);
	} else {
		while (len >= 7) {
			len -= 4;
			dv.setUint32(offset + len, Number(v & 0xffffffffn));
			v >>= 32n;
		}
		putUint(dv, offset, Number(v), len, false);
	}
}
export function getUintBits(dv: DataView, offset: number, len: number, littleEndian?: boolean) {
	const pad0 = offset & 7;
	const end = len + pad0;
	if (end >= 32)
		return Number(getBigUintBits(dv, offset, len, littleEndian));
	
	const x = getUint(dv, offset >> 3, (end + 7) >> 3, littleEndian);
	return (littleEndian ? (x >> pad0) : (x >> ((8 - end) & 7))) & ((1 << len) - 1);
}

export function putUintBits(dv: DataView, offset: number, v: number, len: number, littleEndian?: boolean) {
	const pad0	= offset & 7;
	const end	= len + pad0;
	if (end >= 32)
		return putBigUintBits(dv, offset, BigInt(v), len, littleEndian);

	const boffset	= offset >> 3;
	const blast		= (end - 1) >> 3;
	const pad1		= end & 7;

	v &= (1 << len) - 1;
	if (littleEndian) {
		if (pad0)
			v = (v << pad0) | (dv.getUint8(boffset) & (0xff >> (8 - pad0)));
		if (pad1)
			v |= (dv.getUint8(boffset + blast) & (0xff << pad1)) << (blast << 3);
	} else {
		if (pad1)
			v = (v << (8 - pad1)) | (dv.getUint8(boffset + blast) & (0xff >> pad1));
		if (pad0)
			v |= (dv.getUint8(boffset) & (0xff << (8 - pad0))) << (blast << 3);
	}

	putUint(dv, boffset, v, blast + 1, littleEndian);
}

export function getBigUintBits(dv: DataView, offset: number, len: number, littleEndian?: boolean) {
	const end = (offset & 7) + len;
	const x = getBigUint(dv, offset >> 3, (end + 7) >> 3, littleEndian);
	return (littleEndian ? (x >> BigInt(offset & 7)) : (x >> BigInt((8 - end) & 7))) & ((1n << BigInt(len)) - 1n);
}

export function putBigUintBits(dv: DataView, offset: number, v: bigint, len: number, littleEndian?: boolean) {
	const pad0	= offset & 7;
	const end	= len + pad0;

	const boffset	= offset >> 3;
	const blast		= (end - 1) >> 3;
	const pad1		= end & 7;

	v &= (1n << BigInt(len)) - 1n;
	if (littleEndian) {
		if (pad0)
			v = (v << BigInt(pad0)) | (BigInt(dv.getUint8(boffset) & (0xff >> (8 - pad0))));
		if (pad1)
			v |= BigInt(dv.getUint8(boffset + blast) & (0xff << pad1)) << BigInt(blast << 3);
	} else {
		if (pad1)
			v = (v << BigInt(8 - pad1)) | (BigInt(dv.getUint8(boffset + blast) & (0xff >> pad1)));
		if (pad0)
			v |= BigInt(dv.getUint8(boffset) & (0xff << (8 - pad0))) << BigInt(blast << 3);
	}

	putBigUint(dv, boffset, v, blast + 1, littleEndian);
}

function bytesView<N extends number>(len: N, littleEndian?: boolean): BitViewer<bigint|number> {
	if (len >= 7) {
		const rem = len % 7;
		const remGetter = bytesView(rem, littleEndian);
		return littleEndian ? {
			get(dv: DataView, offset: number) {
				let result = 0n, i = len as number;
				while (i >= 7) {
					i -= 4;
					result = (result << 32n) | BigInt(dv.getUint32(offset + i, true));
				}
				return (result << BigInt(i * 8)) + BigInt(remGetter.get(dv, offset));
			},
			set(dv: DataView, offset: number, v: bigint) {
				const end = offset + len;
				while (offset + 7 <= end) {
					dv.setUint32(offset, Number(v & 0xffffffffn), true);
					v >>= 32n;
					offset += 4;
				}
				remGetter.set(dv, offset, Number(v));
			}

		} : {
			get(dv: DataView, offset: number) {
				const end = offset + len;
				let result = 0n;
				while (offset + 7 <= end) {
					result = (result << 32n) | BigInt(dv.getUint32(offset));
					offset += 4;
				}
				return (result << BigInt((end - offset) * 8)) + BigInt(remGetter.get(dv, offset));
			},
			set(dv: DataView, offset: number, v: bigint) {
				let i = len as number;
				while (i >= 7) {
					i -= 4;
					dv.setUint32(offset + i, Number(v & 0xffffffffn));
					v >>= 32n;
				}
				remGetter.set(dv, offset, Number(v));
			}
		}
	} else {
		const tableLE: BitViewer<number>[] = [
			{get: (dv, o) => dv.getUint16(o, true), set: (dv, o, v) => dv.setUint16(o, v, true)},
			{get: (dv, o) => dv.getUint16(o, true) | (dv.getInt8(o + 2) << 16), set: (dv, o, v) => (dv.setUint16(o, v, true), dv.setUint8(o + 2, v >> 16))},
			{get: (dv, o) => dv.getUint32(o, true), set: (dv, o, v) => dv.setUint32(o, v, true)},
			{get: (dv, o) => dv.getUint32(o, true) + dv.getInt8(o + 4) * 2**32, set: (dv, o, v) => (dv.setUint32(o, v, true), dv.setUint8(o + 4, Math.floor(v / 2**32)))},
			{get: (dv, o) => dv.getUint32(o, true) + dv.getInt16(o + 4, true) * 2**32, set: (dv, o, v) => (dv.setUint32(o, v, true), dv.setUint16(o + 4, Math.floor(v / 2**32), true))},
		];

		const tableBE: BitViewer<number>[] = [
			{get: (dv, o) => dv.getUint16(o), set: (dv, o, v) => dv.setUint16(o, v)},
			{get: (dv, o) => (dv.getUint16(o) << 8) | dv.getInt8(o + 2), set: (dv, o, v) => (dv.setUint16(o, v >> 8), dv.setUint8(o + 2, v))},
			{get: (dv, o) => dv.getUint32(o), set: (dv, o, v) => dv.setUint32(o, v)},
			{get: (dv, o) => dv.getUint32(o) * 2**8 + dv.getInt8(o + 4), set: (dv, o, v) => (dv.setUint32(o, Math.floor(v / 2**8)), dv.setUint8(o + 4, v))},
			{get: (dv, o) => dv.getUint32(o) * 2**16 + dv.getInt16(o + 4), set: (dv, o, v) => (dv.setUint32(o, Math.floor(v / 2**16)), dv.setUint16(o + 4, v))},
		];
		return len == 1
			? {get: (dv, o) => dv.getUint8(o), set: (dv, o, v: number) => dv.setUint8(o, v)}
			: littleEndian ? tableLE[len - 2] : tableBE[len - 2];
	}
}


function bitsView<N extends number>(len: N, littleEndian?: boolean, fixedOffset?: number): BitViewer<bigint|number> {
	if (fixedOffset !== undefined) {
		const shift = fixedOffset & 7;
		const end  	= len + shift;
		const bytes = bytesView((end + 7) >> 3, littleEndian);

		const shift1		= littleEndian ? shift : (8 - end) & 7;
		const shift2: any	= len > 32 ? BigInt(shift1) : shift1;
		const mask: any		= len > 32 ? ((1n << BigInt(len)) - 1n) << shift2 : ((1 << len) - 1) << shift1;
		return shift1 ? {
			get: (dv: DataView, offset: number) => ((bytes.get(dv, offset >> 3) as any) >> shift2) & mask,
			set: (dv: DataView, offset: number, v: any) => {
				const boffset = offset >> 3;
				bytes.set(dv, boffset, ((bytes.get(dv, boffset) as any) & ~mask) | ((v << shift2) & mask));
			}
		} : len & 7 ? {
			get: (dv: DataView, offset: number) => (bytes.get(dv, offset >> 3) as any) & mask,
			set: (dv: DataView, offset: number, v: any) => {
				const boffset = offset >> 3;
				bytes.set(dv, boffset, ((bytes.get(dv, boffset) as any) & ~mask) | (v & mask));
			}
		} : {
			get: (dv: DataView, offset: number) => bytes.get(dv, offset >> 3),
			set: (dv: DataView, offset: number, v: any) => bytes.set(dv, offset >> 3, v)
		};
	}

	if (len > 32) {
		const mask = (1n << BigInt(len)) - 1n;

		return littleEndian ? {
			get(dv: DataView, offset: number) {
				const shift = offset & 7;
				return (getBigUint(dv, offset >> 3, (shift + len + 7) >> 3, true) >> BigInt(shift)) & mask;
			},
			set(dv: DataView, offset: number, v: bigint) {
				const pad0	= offset & 7;
				const end	= len + pad0;
				const boffset = offset >> 3;
				const blast	= (end - 1) >> 3;
				const pad1	= end & 7;

				v &= mask;
				if (pad0)
					v = (v << BigInt(pad0)) | (BigInt(dv.getUint8(boffset) & (0xff >> (8 - pad0))));
				if (pad1)
					v |= BigInt(dv.getUint8(boffset + blast) & (0xff << pad1)) << BigInt(blast << 3);

				putBigUint(dv, boffset, v, blast + 1, true);
			}
		} : {
			get(dv: DataView, offset: number) {
				const end = (offset & 7) + len;
				return (getBigUint(dv, offset >> 3, (end + 7) >> 3, false) >> BigInt((8 - end) & 7)) & mask;
			},
			set(dv: DataView, offset: number, v: bigint) {
				const pad0	= offset & 7;
				const end	= len + pad0;
				const boffset = offset >> 3;
				const blast	= (end - 1) >> 3;
				const pad1	= end & 7;

				v &= mask;
				if (pad1)
					v = (v << BigInt(8 - pad1)) | (BigInt(dv.getUint8(boffset + blast) & (0xff >> pad1)));
				if (pad0)
					v |= BigInt(dv.getUint8(boffset) & (0xff << (8 - pad0))) << BigInt(blast << 3);

				putBigUint(dv, boffset, v, blast + 1, false);
			}
		};
	} else {
		const mask = (1 << len) - 1;

		return littleEndian ? {
			get(dv: DataView, offset: number) {
				const shift		= offset & 7;
				const blen  	= (len + shift + 7) >> 3;
				const x			= getUint(dv, offset >> 3, blen, true);
				return (blen < 4 ? x >> shift : x / 2 ** shift) & mask;
			},
			set(dv: DataView, offset: number, v: number) {
				const shift		= offset & 7;
				const blen  	= (len + shift + 7) >> 3;
				const boffset	= offset >> 3;
				if (blen < 4)
					putUint(dv, boffset, (getUint(dv, boffset, blen, true) & ~(mask << shift)) | ((v & mask) << shift), blen, true);
				else
					putUint(dv, boffset, Number((BigInt(getUint(dv, boffset, blen, true)) & ~(BigInt(mask) << BigInt(shift))) | (BigInt(v & mask) << BigInt(shift))), blen, true);
			}
		} : {
			get(dv: DataView, offset: number) {
				const end  		= len + (offset & 7);
				const blen  	= (end + 7) >> 3;
				const shift		= (8 - end) & 7;
				const x			= getUint(dv, offset >> 3, blen, false);
				return (blen < 4 ? x >> shift : x / 2 ** shift) & mask;
			},
			set(dv: DataView, offset: number, v: number) {
				const end  		= len + (offset & 7);
				const blen  	= (end + 7) >> 3;
				const boffset	= offset >> 3;
				const shift		= (8 - end) & 7;
				if (blen < 4)
					putUint(dv, boffset, (getUint(dv, boffset, blen, false) & ~(mask << shift)) | ((v & mask) << shift), blen, false);
				else
					putUint(dv, boffset, Number((BigInt(getUint(dv, boffset, blen, false)) & ~(BigInt(mask) << BigInt(shift))) | (BigInt(v & mask) << BigInt(shift))), blen, false);
			}
		};
	}
}

//-----------------------------------------------------------------------------
//	float
//-----------------------------------------------------------------------------

const NumberDV	= new DataView(new ArrayBuffer(8));

function NumberToRep(f: number) {
	NumberDV.setFloat64(0, f, true);
	return NumberDV.getBigUint64(0, true);
}
function RepToNumber(i: bigint): number {
	NumberDV.setBigUint64(0, i, true);
	return NumberDV.getFloat64(0, true);
}

interface FloatParts<M extends number|bigint = number|bigint> {
	mantissa:	M,
	exponent:	number,
	sign:		number;
}

export function toNumber(parts: FloatParts) {
	return RepToNumber(float64.pack(parts));
}

function floatAdd(a: FloatParts, b: FloatParts) {
	if (a.exponent > b.exponent)
		[a, b] = [b,a];
	if (b.exponent === Infinity)
		return b;
	const am = BigInt(a.mantissa);
	const bm = BigInt(b.mantissa) << BigInt(b.exponent - a.exponent);
	return a.sign === b.sign
		? {mantissa: am + bm, exponent: a.exponent, sign: a.sign}
		: am >= bm
		? {mantissa: am - bm, exponent: a.exponent, sign: a.sign}
		: {mantissa: bm - am, exponent: a.exponent, sign: b.sign};
}

function floatMul(a: FloatParts, b: FloatParts) {
	return {mantissa: BigInt(a.mantissa) * BigInt(b.mantissa), exponent: a.exponent + b.exponent, sign: a.sign ^ b.sign};
}

function floatDiv(a: FloatParts, b: FloatParts, precision: number) {
	return !b.mantissa
		? {mantissa: 0n, exponent: Infinity, sign: a.sign ^ b.sign}
		: {mantissa: (BigInt(a.mantissa) << BigInt(precision)) / BigInt(b.mantissa), exponent: a.exponent - b.exponent - precision, sign: a.sign ^ b.sign};
}

function floatPow(a: FloatParts, b: FloatParts, precision: number) {
	const mul = (a: FloatParts<bigint>, b: FloatParts<bigint>) =>
		({mantissa: (a.mantissa * b.mantissa) >> BigInt(precision - 1), exponent: a.exponent + b.exponent + precision - 1, sign: 0});

	const sqrt = (a: FloatParts<bigint>): FloatParts<bigint> =>
		a.exponent & 1
			? {mantissa: isqrt(a.mantissa << BigInt(precision + 1)) >> 1n, exponent: (a.exponent - precision + 1) >> 1, sign: 0}
			: {mantissa: isqrt(a.mantissa << BigInt(precision)), exponent: (a.exponent - precision) >> 1, sign: 0};

	let result	= {mantissa: 1n << BigInt(precision), exponent: -precision, sign: 0};
	if (!b.mantissa)
		return result;
	if (!a.mantissa)
		return a;

	const shift	= highestSetIndex(a.mantissa) + 1 - precision;
	const am 	= shift > 0 ? BigInt(a.mantissa) >> BigInt(shift) : BigInt(a.mantissa) << BigInt(-shift);
	const bm	= BigInt(b.mantissa);

	const whole	= b.exponent < 0 ? (bm >> BigInt(-b.exponent)) : (bm << BigInt(b.exponent));
	if (whole) {
		let		base = {mantissa: am, exponent: a.exponent + shift, sign: 0};
		let		n;
		for (n = whole; !(n & 1n); n >>= 1n)
			base = mul(base, base);

		result = base;
		for (n >>= 1n; n; n >>= 1n) {
			base = mul(base, base);
			if (n & 1n)
				result = mul(result, base);
		}
	}

	if (b.exponent < 0) {
		const	fracBits= Math.min(-b.exponent, precision + 4);
		let		mask	= 1n << BigInt(fracBits);
		let 	frac	= (bm >> BigInt(-b.exponent - fracBits)) & (mask - 1n);
		if (frac && a.sign)
			return {mantissa: 0n, exponent: Infinity, sign: 1};

		let		base	= {mantissa: am, exponent: a.exponent + shift, sign: 0};
		for (mask >>= 1n; frac; mask >>= 1n) {
			base = sqrt(base);
			if (frac & mask) {
				result = mul(result, base);
				frac -= mask;
			}
		}
	}

	if (b.sign)
		 result = {mantissa: (1n << BigInt(precision << 1)) / result.mantissa, exponent: -result.exponent - (precision << 1), sign: 0};

	if (a.sign && (whole & 1n))
		result.sign = 1;
	return result;
}

function floatMod(a: FloatParts, b: FloatParts) {
	if (!b.mantissa || a.exponent === Infinity)
		return {mantissa: 0, exponent: Infinity, sign: a.sign ^ b.sign};
	if (b.exponent === Infinity)
		return a;
	const e = Math.min(a.exponent, b.exponent);
	return {mantissa: (BigInt(a.mantissa) << BigInt(a.exponent - e)) % (BigInt(b.mantissa) << BigInt(b.exponent - e)), exponent: e, sign: a.sign};
}

function floatCompare(a: FloatParts, b: FloatParts) {
	const sign = a.sign ? -1 : 1;
	if (a.sign !== b.sign)
		return sign;

	let am	= BigInt(a.mantissa);
	let bm	= BigInt(b.mantissa);
	const e	= a.exponent - b.exponent;
	if (e < 0)
		bm <<= BigInt(-e);
	else if (e > 0)
		am <<= BigInt(e);

	return am === bm ? 0 : am > bm ? sign : -sign;
}

export interface FloatInstance<R extends number | bigint = number | bigint, M extends number | bigint = R> {
	raw: R;
	from(x: number): 	this;
	parts():			FloatParts<M>;
	valueOf():			number;
	toString(): 		string;
	abs():				this;
	neg():				this;
	add(b: this):		this;
	sub(b: this):		this;
	mul(b: this):		this;
	div(b: this):		this;
	mod(b: this):		this;
	pow(b: this):		this;
	compare(b: this):	number;
}

interface Float<R extends number | bigint, M extends number|bigint> extends BitAdapter<R, FloatInstance<R, M>> {
	(value: number):	FloatInstance<R, M>;

	bits: number;
	to(i: number|bigint):			FloatInstance<R, M>;
	from(x: FloatInstance<R, M>):	R;
	parts(mantissa: M, exp: number, sign: number): FloatInstance<R, M>;
	split(raw: R): 		FloatParts<M>;
	pack(parts: FloatParts): R;
}

export const float8e4m3 = Float(3, 4);
export const float8e5m2 = Float(2, 5);
export const float16	= Float(10, 5);
export const Bfloat16	= Float(7, 8);
export const float32	= Float(23, 8);
export const float64	= Float(52, 11);
export const float128	= Float(112, 15);

export function Float<M extends number>(mbits: M, ebits: number, ebias = (1 << (ebits - 1)) - 1, sbit = true): Float<M extends UpTo32 ? number : bigint, BitInput<M>> {
	const bits = BitFields(0, {
		mantissa:	mbits as number,
		exponent:	ebits as UpTo32,
		sign:		(sbit ? 1 : 0) as UpTo16,
	});

	type MT			= BitInput<M>;
	type RT			= M extends UpTo32 ? number : bigint;
	type Instance	= FloatInstance<RT, MT>;

	const emax		= (1 << ebits) - 1;
	const mimpN		= 2 ** mbits;
	const mimpB		= 1n << BigInt(mbits);
	const signN		= sbit ? 1 << (mbits + ebits) : 0;
	const signB 	= sbit ? 1n << BigInt(mbits + ebits) : 0n;

	ebias += mbits;

	const splitAdjust = (parts: FloatParts) => {
		const m = parts.mantissa;
		const e = parts.exponent;
		return	e === emax	? {mantissa: m, exponent: Infinity, sign: parts.sign}
			:	e === 0		? {mantissa: m, exponent: 1 - ebias, sign: parts.sign}
			:	{mantissa: typeof m === "bigint" ? m + mimpB : m + mimpN, exponent: e - ebias, sign: parts.sign};
	};

	const packAdjust = (parts: FloatParts) => {
		if (parts.mantissa === 0)
			return {mantissa: 0, exponent: parts.exponent === Infinity ? emax : 0, sign: parts.sign};

		let shift	= highestSetIndex(parts.mantissa) - mbits;
		let e		= parts.exponent + ebias + shift;
		if (e >= emax)
			return {mantissa: 0, exponent: emax, sign: parts.sign};

		if (e <= 0) {
			shift	-= e - 1;
			e		= 0;
		}
		return {mantissa: shift < 0 ? BigInt(parts.mantissa) << BigInt(-shift) : BigInt(parts.mantissa) >> BigInt(shift), exponent: e, sign: parts.sign};
	};

	const prototype = mbits === 52 && ebits === 11 && ebias === 1023 && sbit ? {
		raw: 0n,
		from(x: number)		{ return rawN(x); },
		parts()				{ return splitAdjust(bits.to(this.raw)); },
		valueOf()			{ return RepToNumber(this.raw); },
		toString()			{ return this.valueOf().toString(); },
		abs() 				{ return make(this.raw & ~signB); },
		neg() 				{ return make(this.raw ^ signB); },
		add(b)				{ return rawN(+this + +b); },
		sub(b)				{ return rawN(+this - +b); },
		mul(b)				{ return rawN(+this * +b); },
		div(b)				{ return rawN(+this / +b); },
		mod(b)				{ return rawN(+this % +b); },
		pow(b)				{ return rawN((+this) ** (+b)); },
		compare(b)			{ return compare(+this, +b); },
	} as FloatInstance<bigint, number> : bits.bits > 32 ? {
		raw: 0n,
		from(x: number)		{ return rawP(float64.split(NumberToRep(x))); },
		parts()				{ return splitAdjust(bits.to(this.raw)); },
		valueOf()			{ return RepToNumber(float64.pack(splitAdjust(bits.to(this.raw)))); },
		toString()			{ return this.valueOf().toString(); },
		abs() 				{ return make(this.raw & ~signB); },
		neg() 				{ return make(this.raw ^ signB); },
		add(b)				{ return rawP(floatAdd(this.parts(), b.parts())); },
		sub(b)				{ return rawP(floatAdd(this.parts(), b.neg().parts())); },
		mul(b)				{ return rawP(floatMul(this.parts(), b.parts())); },
		div(b)				{ return rawP(floatDiv(this.parts(), b.parts(), mbits)); },
		mod(b)				{ return rawP(floatMod(this.parts(), b.parts())); },
		pow(b)				{ return rawP(floatPow(this.parts(), b.parts(), mbits + 8)); },
		compare(b)			{ return floatCompare(this.parts(), b.parts()); },
	} as FloatInstance<bigint, bigint> : {
		raw: 0,
		from(x: number)		{ return rawP(float64.split(NumberToRep(x))); },
		parts()				{ return splitAdjust(bits.to(this.raw)); },
		valueOf()			{ return RepToNumber(float64.pack(splitAdjust(bits.to(this.raw)))); },
		toString()			{ return this.valueOf().toString(); },
		abs() 				{ return make(this.raw & ~signN); },
		neg() 				{ return make(this.raw ^ signN); },
		add(b)				{ return rawP(floatAdd(this.parts(), b.parts())); },
		sub(b)				{ return rawP(floatAdd(this.parts(), b.neg().parts())); },
		mul(b)				{ return rawP(floatMul(this.parts(), b.parts())); },
		div(b)				{ return rawP(floatDiv(this.parts(), b.parts(), mbits)); },
		mod(b)				{ return rawP(floatMod(this.parts(), b.parts())); },
		pow(b)				{ return rawP(floatPow(this.parts(), b.parts(), mbits + 8)); },
		compare(b)			{ return floatCompare(this.parts(), b.parts()); },
	} as FloatInstance<number, number>;

	function make(i: number|bigint) {
		const obj = Object.create(prototype) as Instance;
		obj.raw = i as RT;
		return obj;
	}
	const rawN	= (f: number) => make(NumberToRep(f));
	const rawP	= (p: FloatParts) => make(bits.from(packAdjust(p)));
	const getter = bitsView(bits.bits, true);

	return Object.assign((prototype as Instance).from, {
		bits:	bits.bits,
		to:		make,
		get:	(dv: DataView, offset: number) => make(getter.get(dv, offset)),
		set:	(dv: DataView, offset: number, v: Instance) => getter.set(dv, offset, v.raw),
		from(x: Instance) 			{ return x.raw; },
		split(raw: number|bigint)	{ return splitAdjust(bits.to(raw)) as FloatParts<MT>; },
		pack(parts: FloatParts)		{ return bits.from(packAdjust(parts)) as RT; },
		parts(mantissa: MT, exponent: number, sign: number) { return make(bits.from(packAdjust({mantissa, exponent, sign}))); },
	});
}

//-----------------------------------------------------------------------------
//	buffers
//-----------------------------------------------------------------------------

export interface TypedArray<R = any> extends ArrayBufferView {
	length:			number;
    [n: number]:	R;

	[Symbol.iterator](): IterableIterator<R>;
	slice(begin:	number, end?: number): this;
	subarray(begin: number, end?: number): this;
	set(array: ArrayLike<R>, offset?: number): void;

	copyWithin(target: number, start: number, end?: number): this;
	every(callback: (value: R, index: number, array: this) => unknown, thisArg?: any): boolean;
	fill(value: R, start?: number, end?: number): this;
	filter(callback: (value: R, index: number, array: this) => any, thisArg?: any): this;
	find(callback: (value: R, index: number, array: this) => boolean, thisArg?: any): R | undefined;
	findIndex(callback: (value: R, index: number, array: this) => boolean, thisArg?: any): number;
	forEach(callback: (value: R, index: number, array: this) => void, thisArg?: any): void;
	indexOf(searchElement: R, fromIndex?: number): number;
	join(separator?: string): string;
	lastIndexOf(searchElement: R, fromIndex?: number): number;
	map(callback: (value: R, index: number, array: this) => any, thisArg?: any): this;
	reduce(callback: (prev: R, curr: R, index: number, array: this) => R, initial?: R): R;
    reduce<U>(callback: (prev: U, curr: R, index: number, array: this) => U, initial: U): U;
	reduceRight(callback: (prev: R, curr: R, index: number, array: this) => R, initial?: R): R;
    reduceRight<U>(callback: (prev: U, curr: R, index: number, array: this) => U, initial: U): U;
	reverse(): this;
	some(callback: (value: R, index: number, array: this) => unknown, thisArg?: any): boolean;
	sort(compareFn?: (a: R, b: R) => number): this;
	toString(): string;
}

const TypedArrayProto = {
    copyWithin: 	Array.prototype.copyWithin,
    every: 			Array.prototype.every,
    fill: 			Array.prototype.fill,
    filter: 		Array.prototype.filter,
    find: 			Array.prototype.find,
    findIndex: 		Array.prototype.findIndex,
    forEach: 		Array.prototype.forEach,
    indexOf: 		Array.prototype.indexOf,
    join: 			Array.prototype.join,
    lastIndexOf: 	Array.prototype.lastIndexOf,
    map: 			Array.prototype.map,
    reduce: 		Array.prototype.reduce,
    reduceRight: 	Array.prototype.reduceRight,
    reverse: 		Array.prototype.reverse,
    some: 			Array.prototype.some,
    sort: 			Array.prototype.sort,
    toString: 		Array.prototype.toString,
};

export interface TypedArrayLike {
	byteLength: number,
}
export type ViewMaker<T> = (new(a: ArrayBufferLike, offset: number, length: number)=>T) & {BYTES_PER_ELEMENT?: number};
export type TypedElement<T> = T extends TypedArray<infer R> ? R : T extends TypedArrayConstructor<infer R> ? R : never;

export interface TypedArrayConstructor<T extends TypedArray = TypedArray> {
	BYTES_PER_ELEMENT?: number;
	new(length: number): T;
	new(array: ArrayLike<TypedElement<T>>): T;
//	new<TArrayBuffer extends ArrayBufferLike = ArrayBuffer>(buffer: TArrayBuffer, byteOffset?: number, length?: number): T;
	new(buffer: ArrayBufferLike, byteOffset?: number, length?: number): T;
	new(elements: Iterable<TypedElement<T>>): T;

	of(...items: TypedElement<T>[]): T;
	from(array: ArrayLike<TypedElement<T>>): T;
	from<U>(array: ArrayLike<U>, mapfn: (v: U, k: number) => TypedElement<T>, thisArg?: any): T;
	from(elements: Iterable<TypedElement<T>>): T;
	from<U>(elements: Iterable<U>, mapfn?: (v: U, k: number) => TypedElement<T>, thisArg?: any): T;
};

//export type ViewInstance<V> = V extends new(a: SharedArrayBuffer, o: number, l: number) => infer T ? T : never;

// I am not happy about this, but I can't find a way to avoid ArrayBuffer without it
export type ViewInstance<V> = 
    V extends typeof Uint8Array		? Uint8Array<ArrayBufferLike>		:
    V extends typeof Int8Array		? Int8Array<ArrayBufferLike>		:
    V extends typeof Uint16Array	? Uint16Array<ArrayBufferLike>		:
    V extends typeof Int16Array		? Int16Array<ArrayBufferLike>		:
    V extends typeof Uint32Array	? Uint32Array<ArrayBufferLike>		:
    V extends typeof Int32Array		? Int32Array<ArrayBufferLike>		:
    V extends typeof Float32Array	? Float32Array<ArrayBufferLike>		:
    V extends typeof Float64Array	? Float64Array<ArrayBufferLike>		:
    V extends typeof BigUint64Array	? BigUint64Array<ArrayBufferLike>	:
    V extends typeof BigInt64Array	? BigInt64Array<ArrayBufferLike>	:
    V extends new(a: ArrayBufferLike, o: number, l: number) => infer T ? T : never;

interface TypedArrayBacking<R> {
	byteLength: number,
	get(index: number): R;
	set(index: number, value: R): void;
};
type TypedArrayBackingFactory<R> = (buffer: ArrayBufferLike, byteOffset: number, begin: number, length: number) => TypedArrayBacking<R>;

function TypedArray<R>(backingFactory: TypedArrayBackingFactory<R>, BYTES_PER_ELEMENT?: number) {
	const bpe = BYTES_PER_ELEMENT ?? 1;

	function make(buffer: ArrayBufferLike, byteOffset: number, begin: number, length: number): TypedArray<R> {
		const backing = backingFactory(buffer, byteOffset, begin, length);
		return new Proxy(Object.assign(Object.create(TypedArrayProto), {
			length,
			buffer,
			byteOffset,
			byteLength: backing.byteLength,
			constructor: ctor,
			slice(begin: number, end?: number) 			{ return make(buffer, byteOffset, begin, (end ? Math.min(end, length) : length) - begin); },
			subarray(begin: number, end?: number) 		{ return make(buffer, byteOffset, begin, (end ? Math.min(end, length) : length) - begin); },
			set(array: ArrayLike<R>, offset?: number)	{
				for (let i = 0; i < array.length; i++)
					backing.set((offset ?? 0) + i, array[i]);
			},
			[Symbol.iterator](): IterableIterator<R> {
				let index = 0;
				return {
					next: () => {
						return index < length
							? { value: backing.get(index++) as R, done: false }
							: { value: undefined, done: true };
					},
					[Symbol.iterator]() {
						return this;
					}
				};
			},
		}), {
			get(target, prop) {
				if (prop in target)
					return target[prop as keyof typeof target];

				const index = Number(prop);
				return !isNaN(index) && index >= 0 && index < length ? backing.get(index) : undefined;
			},
			set(_target, prop, value: R) {
				const index = Number(prop);
				if (!isNaN(index) && index >= 0 && index < length) {
					backing.set(index, value);
					return true;
				}
				return false;
			}
		}) as TypedArray<R>;
	}

	function create(n: number) {
		return make(new ArrayBuffer(Math.ceil(n * bpe)), 0, 0, n);
	}
	function fromArray(array: ArrayLike<R>) {
		const r = create(array.length);
		r.set(array);
		return r;
	}
	function fromBuffer(buffer: ArrayBufferLike, byteOffset = 0, byteLength = buffer.byteLength - byteOffset) {
		return make(buffer, byteOffset, 0, Math.floor(byteLength / bpe));
	}

	function ctor(...args: any[]) {
		if (args.length > 1) {
			const [buffer, byteOffset, length] = args as [ArrayBufferLike, number, number?];
			return make(buffer, byteOffset, 0, length ?? Math.floor((buffer.byteLength - byteOffset) / bpe));
		}
		const a = args[0];
		if (a === undefined)
			return create(0);
		if (typeof a === "number")
			return create(a);
		if (a instanceof ArrayBuffer)
			return fromBuffer(a);
		if (ArrayBuffer.isView(a))
			return fromBuffer(a.buffer, a.byteOffset, a.byteLength);
		return fromArray(typeof (a as any)[Symbol.iterator] === 'function' ? Array.from(a as Iterable<R>) : a as ArrayLike<R>);
	}
	return Object.assign(ctor, {
		BYTES_PER_ELEMENT,
		from(a: ArrayLike<R>|Iterable<R>, mapfn?: (v: R, k: number) => R, thisArg?: any): TypedArray<R> {
			if (!mapfn) {
				if (a instanceof ArrayBuffer)
					return fromBuffer(a);
				if (ArrayBuffer.isView(a))
					return fromBuffer(a.buffer, a.byteOffset, a.byteLength);
			}
			const array	= typeof (a as any)[Symbol.iterator] === 'function'
				? (mapfn ? Array.from(a as Iterable<R>, mapfn, thisArg) : Array.from(a as Iterable<R>))
				: (mapfn ? Array.from(a as ArrayLike<R>, mapfn, thisArg) : Array.from(a as ArrayLike<R>));
			return fromArray(array);
		},
		of(...items: R[]): TypedArray<R> {
			return fromArray(items);
		}

	}) as any as TypedArrayConstructor<TypedArray<R>>;
}

function BitViewerTypedArray<D>(bits: number, viewer: BitViewer<D>): TypedArrayConstructor<TypedArray<D>> {
	if ((bits & 7) === 0) {
		const bytes	= (bits + 7) >> 3;
		return TypedArray((buffer: ArrayBufferLike, byteOffset: number, begin: number, length: number) => {
			const byteLength = length * bytes;
			const dv = new DataView(buffer, byteOffset + begin * bytes, byteLength);
			return {
				byteLength,
				get(index: number)				{ return viewer.get(dv, index * bits); },
				set(index: number, value: any)	{ viewer.set(dv, index * bits, value); }
			};
		}, bytes);
	} else {
		return TypedArray((buffer: ArrayBufferLike, byteOffset: number, begin: number, length: number) => {
			const shift = (begin * bits) & 7;
			const byteLength = (shift + length * bits + 7) >> 3;
			const dv = new DataView(buffer, byteOffset + ((begin * bits) >> 3), byteLength);
			return {
				byteLength,
				get(index: number)				{ return viewer.get(dv, shift + index * bits); },
				set(index: number, value: any)	{ viewer.set(dv, shift + index * bits, value); }
			};
		}, bits / 8);
	}
}


export function UintTypedArray<N extends number>(bits: N, be?: boolean) {
	return BitViewerTypedArray(bits, BitViewerUnsigned(bits, be));
}

export function IntTypedArray<N extends number>(bits: N, be?: boolean) {
	return BitViewerTypedArray(bits, BitViewerSigned(bits, be));
}

export function BitFieldsTypedArray<T extends BitFieldDescriptor>(bitfields: T, be = false) {
	const bits		= calcBits(bitfields);
	const viewer	= BitFieldsViewer(bitfields, be, bits & 7 ? undefined : 0);
	return BitViewerTypedArray(bits, viewer);
}
/*
export function BitAdapterTypedArray<D>(adapter: BitAdapter<any, D>, be?: boolean) {
	const bits		= adapter.bits;
    const viewer	= BitViewerUnsigned(bits, be, bits & 7 ? undefined : 0);
	//const viewer	= BitViewerChain(BitViewerUnsigned(bits, be, bits & 7 ? undefined : 0), adapter);
	return BitViewerTypedArray(bits, {
        get:(dv, offset)    => adapter.to(viewer.get(dv, offset)),
        set:(dv, offset, w) => viewer.set(dv, offset, adapter.from(w))
    });
}
*/

type DataViewType = 'Uint8' | 'Int8' | 'Uint16' | 'Uint32' | 'BigUint64' | 'Int16' | 'Int32' | 'BigInt64' | 'Float32' | 'Float64';
type DataViewReturnType<T extends DataViewType> = T extends 'BigUint64' ? bigint : T extends 'BigInt64' ? bigint : number;

const typedArrays: Record<DataViewType, TypedArrayConstructor<TypedArray>> = {
	Uint8: 		Uint8Array,
	Int8: 		Int8Array,
	Uint16: 	Uint16Array,
	Int16: 		Int16Array,
	Uint32: 	Uint32Array,
	Int32: 		Int32Array,
	BigUint64: 	BigUint64Array,
	BigInt64: 	BigInt64Array,
	Float32: 	Float32Array,
	Float64: 	Float64Array,
} as const;

function DataViewTypedArray<T extends DataViewType>(type: T, be?: boolean) {
	const BYTES_PER_ELEMENT	= typedArrays[type].BYTES_PER_ELEMENT ?? 1;
	return TypedArray(
		(buffer: ArrayBufferLike, byteOffset: number, begin: number, length: number) => {
			const byteLength = length * BYTES_PER_ELEMENT;
			const dv		= new DataView(buffer, byteOffset + begin * BYTES_PER_ELEMENT, byteLength);
			const getter	= dv[`get${type}`].bind(dv) as (offset: number, littleEndian?: boolean) => DataViewReturnType<T>;
			const setter	= dv[`set${type}`].bind(dv) as (offset: number, value: DataViewReturnType<T>, littleEndian?: boolean) => void;
			return {
				byteLength,
				get: index => getter(index * BYTES_PER_ELEMENT, !be),
				set: (index, value) => setter(index * BYTES_PER_ELEMENT, value, !be),
			};
		},
		BYTES_PER_ELEMENT
	);
}

export const Uint16beArray		= DataViewTypedArray('Uint16', true);		export type Uint16beArray		= InstanceType<typeof Uint16beArray>;
export const Uint32beArray		= DataViewTypedArray('Uint32', true);		export type Uint32beArray		= InstanceType<typeof Uint32beArray>;
export const BigUint64beArray	= DataViewTypedArray('BigUint64', true);	export type BigUint64beArray	= InstanceType<typeof BigUint64beArray>;
export const Int16beArray		= DataViewTypedArray('Int16', true);		export type Int16beArray		= InstanceType<typeof Int16beArray>;
export const Int32beArray		= DataViewTypedArray('Int32', true);		export type Int32beArray		= InstanceType<typeof Int32beArray>;
export const BigInt64beArray	= DataViewTypedArray('BigInt64', true);		export type BigInt64beArray		= InstanceType<typeof BigInt64beArray>;
export const Float32beArray		= DataViewTypedArray('Float32', true);		export type Float32beArray		= InstanceType<typeof Float32beArray>;
export const Float64beArray		= DataViewTypedArray('Float64', true);		export type Float64beArray		= InstanceType<typeof Float64beArray>;

function make<T extends DataViewType>(length: number, type:T, be?: boolean) {
	const BYTES_PER_ELEMENT = typedArrays[type].BYTES_PER_ELEMENT ?? 1;
	const arrayType = be !== isLittleEndian ? typedArrays[type] : DataViewTypedArray(type, be);
	return new arrayType(new ArrayBuffer(length * BYTES_PER_ELEMENT), 0, length);
}

function as<T extends DataViewType>(arg: TypedArray, type: T, be?: boolean) {
	const BYTES_PER_ELEMENT = typedArrays[type].BYTES_PER_ELEMENT ?? 1;
	const arrayType = be !== isLittleEndian && arg.byteOffset % BYTES_PER_ELEMENT === 0 ? typedArrays[type] : DataViewTypedArray(type, be);
	return new arrayType(arg.buffer, arg.byteOffset, Math.floor(arg.byteLength / BYTES_PER_ELEMENT));
}

// never copy, just reinterpret

export function as8(arg: TypedArray) : Uint8Array;
export function as8(arg?: TypedArray) : Uint8Array | undefined;
export function as8(arg?: TypedArray) { return arg && new Uint8Array(arg.buffer, arg.byteOffset, arg.byteLength); }

export function as16(arg: TypedArray, be?: boolean) : Uint16Array;
export function as16(arg?: TypedArray, be?: boolean) : Uint16Array | undefined;
export function as16(arg?: TypedArray, be?: boolean) { return arg && as(arg, 'Uint16', be) as Uint16Array; }

export function as16s(arg: TypedArray, be?: boolean) : Int16Array;
export function as16s(arg?: TypedArray, be?: boolean) : Int16Array | undefined;
export function as16s(arg?: TypedArray, be?: boolean) { return arg && as(arg, 'Int16', be) as Int16Array; }

export function as32(arg: TypedArray, be?: boolean) : Uint32Array;
export function as32(arg?: TypedArray, be?: boolean) : Uint32Array | undefined;
export function as32(arg?: TypedArray, be?: boolean) { return arg && as(arg, 'Uint32', be) as Uint32Array; }

export function as32s(arg: TypedArray, be?: boolean) : Int32Array;
export function as32s(arg?: TypedArray, be?: boolean) : Int32Array | undefined;
export function as32s(arg?: TypedArray, be?: boolean) { return arg && as(arg, 'Int32', be) as Int32Array; }

export function as64(arg: TypedArray, be?: boolean) : BigUint64Array;
export function as64(arg?: TypedArray, be?: boolean) : BigUint64Array | undefined;
export function as64(arg?: TypedArray, be?: boolean) { return arg && as(arg, 'BigUint64', be) as BigUint64Array; }

export function as64s(arg: TypedArray, be?: boolean) : BigInt64Array;
export function as64s(arg?: TypedArray, be?: boolean) : BigInt64Array | undefined;
export function as64s(arg?: TypedArray, be?: boolean) { return arg && as(arg, 'BigInt64', be) as BigInt64Array; }

export function asF32(arg: TypedArray, be?: boolean) : Float32Array;
export function asF32(arg?: TypedArray, be?: boolean) : Float32Array | undefined;
export function asF32(arg?: TypedArray, be?: boolean) { return arg && as(arg, 'Float32', be) as Float32Array; }

export function asF64(arg: TypedArray, be?: boolean) : Float64Array;
export function asF64(arg?: TypedArray, be?: boolean) : Float64Array | undefined;
export function asF64(arg?: TypedArray, be?: boolean) { return arg && as(arg, 'Float64', be) as Float64Array; }

//-----------------------------------------------------------------------------
//	text
//-----------------------------------------------------------------------------

export type TextEncoding = 'latin1' | 'utf8' | 'utf16le' | 'utf16be' | 'utf32le' | 'utf32be';
export const bytesPerCharacter: Record<TextEncoding, number> = {
	latin1: 1,
	utf8: 1,
	utf16le: 2,
	utf16be: 2,
	utf32le: 4,
	utf32be: 4
};

export function stringCode(s: string) {
	let r = 0;
	for (let i = 0; i < s.length; i++)
		r += s.charCodeAt(i) << (i * 8);
	return r;
}
export function stringCodeBig(s: string) {
	let r = 0n;
	for (let i = 0; i < s.length; i++)
		r += BigInt(s.charCodeAt(i)) << BigInt(i * 8);
	return r;
}

export function encodeText(str: string, encoding: TextEncoding = 'utf8', bom = false): Uint8Array {
	if (encoding === 'latin1') {
		const buf = new Uint8Array(str.length);
		for (let i = 0; i < str.length; i++)
			buf[i] = str.charCodeAt(i) & 0xFF;
		return buf;
	}

	if (bom)
		str = String.fromCharCode(0xfeff) + str;

	if (encoding === 'utf8') {
		return new TextEncoder().encode(str);

	} else if (encoding === 'utf16le' || encoding === 'utf16be') {
		const len	= str.length;
		const view	= make(len, 'Uint16', encoding === 'utf16be');
		for (let i = 0; i < len; i++)
			view[i] = str.charCodeAt(i) as number;
		return new Uint8Array(view);

	} else {
		const chars = Array.from(str);
		const len	= chars.length;
		const view	= make(len, 'Uint32', encoding === 'utf32be');
		for (let i = 0; i < len; i++)
			view[i] = chars[i].codePointAt(0) as number;
		return new Uint8Array(view);
	}
}

function textView(buf: TypedArray<number>, encoding: TextEncoding) {
	return as(buf,
		encoding === 'utf8' || encoding === 'latin1' ? 'Uint8' : encoding === 'utf16le' || encoding === 'utf16be' ? 'Uint16' : 'Uint32',
		encoding === 'utf16be' || encoding === 'utf32be'
	);
}

function _decodeText(view: TypedArray<number>): string {
	let result = '';
	for (let i = 0; i < view.length; i += 8192)
		result += String.fromCodePoint(...view.subarray(i, i + 8192));
	return result;
}

export function decodeText(buf: TypedArray<number> | null, encoding: TextEncoding = 'utf8'): string {
	if (!buf)
		return '';
	return encoding === 'utf8'
		? new TextDecoder('utf-8').decode(buf)
		: _decodeText(textView(buf, encoding));
}

export function decodeTextTo0(buf: TypedArray<number> | undefined, encoding: TextEncoding = 'utf8'): string {
	if (!buf)
		return'';
	
	const view		= textView(buf, encoding);
	const zeroIndex = view.indexOf(0);
	const sub		= zeroIndex < 0 ? view : view.subarray(0, zeroIndex);

	return encoding === 'utf8'
		? new TextDecoder('utf-8').decode(sub)
		: _decodeText(sub);
}

const boms: Partial<Record<TextEncoding, number[]>> = {
	utf8: [0xEF, 0xBB, 0xBF],
	utf16le: [0xFF, 0xFE],
	utf16be: [0xFE, 0xFF],
	utf32le: [0xFF, 0xFE, 0x00, 0x00],
	utf32be: [0x00, 0x00, 0xFF, 0xFE],
};
const enc_masks: (TextEncoding | '')[] = [
	'',			//0000
	'utf32le',	//0001
	'utf32le',	//0010
	'utf32le',	//0011
	'utf32be',	//0100
	'utf16le',	//0101
	'',			//0110
	'utf32le',	//0111
	'utf32be',	//1000
	'',			//1001
	'utf16be',	//1010
	'',			//1011
	'utf32be',	//1100
	'',			//1101
	'utf32be',	//1110
	'utf8',		//1111
];

export function getTextEncoding(bytes: ArrayLike<number>): TextEncoding {
	for (const i in boms) {
		const bom = boms[i as TextEncoding]!;
		if (bytes.length >= bom.length && bom.every((b, j) => bytes[j] === b))
			return i as TextEncoding;
	}

	let mask = 0;
	for (let i = 0; i < Math.min(bytes.length, 4); i++)
		mask |= (bytes[i] !== 0 ? 1 << i : 0);
	return enc_masks[mask] || 'utf8';
}

//-----------------------------------------------------------------------------
//	misc
//-----------------------------------------------------------------------------

export interface CRC<T extends number|bigint> {
	more(data: Uint8Array, crc: T): T;
	finish(crc: T): T;
	byte(crc: T, i: number): T;
	buffer(data: Uint8Array, crc?: T): T;
}

//	init and finalXor are accepted as-is; result is normalized at return.
//	For standards-compatible CRC model values, pass width-masked parameters.

export function CRC(poly: number, initial: number, finalXor: number, refin?: boolean, refout?: boolean): CRC<number>;
export function CRC(poly: bigint, initial: bigint, finalXor: bigint, refin?: boolean, refout?: boolean): CRC<bigint>;
export function CRC(poly: number|bigint, initial: number|bigint, finalXor: number|bigint, refin = true, refout = refin): CRC<any> {
	const bits = highestSetIndex(poly) + 1;

	if (bits <= 32) {
		initial		= Number(initial);

		const mask		= (2 ** bits) - 1;
		const msb		= bits > 8 ? 1 << (bits - 1) : 0x80;
		const polyN		= refin || bits >= 8 ? Number(poly) : Number(poly) << (8 - bits);
		const xorout	= Number(finalXor);

		const finish	= refin !== refout
			? (crc: number) => ((bitReverse(crc, bits) as number) ^ xorout) >>> 0
			: (crc: number) => ((crc & mask) ^ xorout) >>> 0;

		const table		= Uint32Array.from({length: 256}, refin
			? (_: any, crc: number) => {
				for (let k = 0; k < 8; k++)
					crc = (crc & 1 ? (crc >>> 1) ^ polyN : crc >>> 1);
				return crc;
			} : (_: any, i: number) => {
				let crc = bits > 8 ? i << (bits - 8) : i;
				for (let k = 0; k < 8; k++)
					crc = (crc & msb ? (crc << 1) ^ polyN : crc << 1);
				return crc;
			}
		);

		const byte = refin
			? (crc: number, i: number) => table[(crc ^ i) & 0xff] ^ (crc >>> 8)
			: bits > 8
			? (crc: number, i: number) => (crc << 8) ^ table[((crc >>> (bits - 8)) ^ i) & 0xff]
			: (crc: number, i: number) => table[(crc ^ i) & 0xff];

		const more = (data: Uint8Array, crc: number) => {
			for (const i of data)
				crc = byte(crc, i);
			return crc;
		};

		return refin || bits >= 8 ? {
			more,
			finish,
			byte:	(crc: number, i: number) => (byte(crc, i) & mask) >>> 0,
			buffer:	(data: Uint8Array, crc = initial) => finish(more(data, crc)),
		} : {
			more,
			finish:	(crc: number) => finish(crc >> (8 - bits)),
			byte:	(crc: number, i: number) => byte(crc << (8 - bits), i) >> (8 - bits),
			buffer:	(data: Uint8Array, crc = initial) => finish(more(data, crc << (8 - bits)) >> (8 - bits)),
		};
		
	} else {
		initial		= BigInt(initial);

		const bbits		= BigInt(bits);
		const mask		= (1n << bbits) - 1n;
		const msb		= 1n << (bbits - 1n);
		const polyN		= BigInt(poly);
		const xorout	= BigInt(finalXor);

		const finish	= refin !== refout
			? (crc: bigint) => (bitReverse(crc, bits) as bigint) ^ xorout
			: (crc: bigint) => (crc & mask) ^ xorout;

		const table		= Array.from({length: 256}, refin
			? (_: any, i: number) => {
				let crc = BigInt(i);
				for (let k = 0; k < 8; k++)
					crc = (crc & 1n ? (crc >> 1n) ^ polyN : crc >> 1n);
				return crc;
			} : (_: any, i: number) => {
				let crc = BigInt(i) << BigInt(bits - 8);
				for (let k = 0; k < 8; k++)
					crc = (crc & msb ? (crc << 1n) ^ polyN : crc << 1n);
				return crc;
			}
		);

		const byte = refin
			? (crc: bigint, i: number) => table[Number((crc ^ BigInt(i)) & 0xffn)] ^ (crc >> 8n)
			: (crc: bigint, i: number) => (crc << 8n) ^ table[Number(((crc >> BigInt(bits - 8)) ^ BigInt(i)) & 0xffn)];

		const more = (data: Uint8Array, crc: bigint) => {
			for (const i of data)
				crc = byte(crc, i);
			return crc;
		};

		return {
			more,
			finish,
			byte:	(crc: bigint, i: number) => byte(crc, i) & mask,
			buffer:	(data: Uint8Array, crc = initial) => finish(more(data, crc)),
		};
	}
}
