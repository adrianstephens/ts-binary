
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


//-----------------------------------------------------------------------------
//	bit stuff
//-----------------------------------------------------------------------------

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

export function toSigned(n: number, bits: number) {
	const m = 1 << (bits - 1);
	return (n & (m - 1)) - (n & m);
}
export function toSignedBig(n: bigint, bits: number) {
	const m = 1n << BigInt(bits - 1);
	return (n & (m - 1n)) - (n & m);
}


//-----------------------------------------------------------------------------
//	Decompression
//-----------------------------------------------------------------------------

export type Codec = (buffer: Uint8Array) => Promise<Uint8Array>;
const compressors: Record<string, Codec> = {};
const decompressors: Record<string, Codec> = {};

async function transformWithStream(Ctor: any, format: string, buffer: Uint8Array) {
	const stream = new Ctor(format);
	const writer = stream.writable.getWriter();
	writer.write(buffer);
	writer.close();
	return new Uint8Array(await new (globalThis as any).Response(stream.readable).arrayBuffer());
}

const supportedCodecs = ['brotli', 'deflate', 'deflate-raw', 'gzip', 'zstd'];

function tryAutoConfigureCodec(name: string, ctor: any): Codec {
	if (ctor && supportedCodecs.includes(name))
		return buffer => transformWithStream(ctor, name, buffer);
	return () => { throw new Error(`Decompression for ${name} is not configured for this environment`); };
}

export function configureCompression(name: string, codec: Codec) {
	compressors[name] = codec;
}
export function configureDecompression(name: string, codec: Codec) {
	decompressors[name] = codec;
}
export function decompress(name: string): Codec {
	return decompressors[name] ??= tryAutoConfigureCodec(name, (globalThis as any).DecompressionStream);
}
export function compress(name: string): Codec {
	return compressors[name] ??= tryAutoConfigureCodec(name, (globalThis as any).CompressionStream);
}

//-----------------------------------------------------------------------------
// adapter
//-----------------------------------------------------------------------------

export interface Adapter<T, D> {
	to(x: T):	D;
	from(x: D):	T;
}

export interface MutableArrayLike<T> {
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
//	KMP
//-----------------------------------------------------------------------------

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
//	after
//-----------------------------------------------------------------------------

export function after<V, R>(v: V, then: (value: Awaited<V>) => R): V extends Promise<any> ? Promise<Awaited<R>> : R {
	if (!(v instanceof Promise))
		return then(v as Awaited<V>) as any;

	return v.then(then) as any;
}

export function tryAfter<V, R>(initial: () => V, then: (value: Awaited<V>) => R, catchFn: (error: any) => R): V extends PromiseLike<any> ? Promise<Awaited<R>> : R {
	let v: V;
	try {
		v = initial();
	} catch (e) {
		return catchFn(e) as any;
	}

	if (v instanceof Promise)
		return v.then(then).catch(catchFn) as any;

	try {
		const result = then(v as Awaited<V>);
		return (result instanceof Promise ? result.catch(catchFn) : result) as any;
	} catch (e) {
		return catchFn(e) as any;
	}
}

class Chain<T> {
	constructor(public value: T) {}
	then<R>(fn: (v: Awaited<T>) => R) {
		return new Chain(after(this.value, fn));
	}
}

export function chain<T>(v: T) {
    return new Chain(v);
}

export function merge(obj: any, value: any, k?: string) {
	if (value !== undefined) {
		if (k) {
			const current = obj[k];
			if (current && typeof value === 'object' && typeof current === 'object' && value.constructor === Object && current.constructor === Object)
				Object.assign(current, value);
			else
				obj[k] = value;
		} else {
			Object.assign(obj, value);
			if (value.constructor)
				Object.setPrototypeOf(obj, value.constructor.prototype);
		}
	}
}

//-----------------------------------------------------------------------------
//	stream
//-----------------------------------------------------------------------------

export abstract class common_stream {
	obj?:	any;
	abstract tell(): number;
	abstract seek(offset: number): void;
	pushObj(obj?: any)							{ return pushObj(this, obj);}
	popObj<T extends object>(obj: T = this.obj)	{ return popObj(this, obj); }
	lookupObj<T>(key: string, def?: T)			{ return lookupObj(this, key, def); }
}

function pushObj(s: common_stream, obj?: any) {
	if (!obj)
		obj = {obj: s.obj} as any;
	else
		obj.obj = s.obj;
	s.obj = obj;
	return obj;
}
function popObj<T extends object>(s: common_stream, obj: T = s.obj) {
	s.obj = (obj as any).obj;
	delete (obj as any).obj;
	return obj;
}

function lookupObj<T>(s: common_stream, key: string, def?: T) : T | undefined {
	for (let obj = s.obj; obj; obj = obj.obj) {
		if (key in obj)
			return obj[key];
	}
	return def;
}

//-----------------------------------------------------------------------------
//	types
//-----------------------------------------------------------------------------

export type UnionToIntersection<U> = (U extends any ? (x: U) => void : never) extends (x: infer I) => void ? I : never;
export type NoPromise<T> = T extends PromiseLike<infer R> ? R : T;
export type MaybePromise<T> = T | Promise<T>;
export type MaybePromise2<T, A extends boolean> = A extends true ? Promise<T> : T;

export interface MergeBase<T> { merge: T; }
export interface MergeType<T> extends MergeBase<T> { readonly correlated: false; }
export interface CorrelatedMerge<T> extends MergeBase<T> { readonly correlated: true; }

type TupleReadType<T extends readonly unknown[]> = T extends readonly [infer First, ...infer Rest]
	? [ReadType<First>, ...TupleReadType<Rest>]
	: [];


type StripMerge<T>		= T extends MergeBase<infer U> ? StripMerge<U> : T;
type MergedInner<T>		= T extends MergeType<infer U> ? U : never;
type CorrelatedInner<T> = T extends MergeType<infer U> ? CorrelatedInner<U> : T extends CorrelatedMerge<infer U> ? U : never;
type AllMerged<T>		= Exclude<{ [K in keyof T]: T[K] extends { get: (...args: any) => infer R }	? MergedInner<NoPromise<R>> : never}[keyof T], never>;
type AllCorrelated<T>	= Exclude<{ [K in keyof T]: T[K] extends { get: (...args: any) => infer R } ? CorrelatedInner<NoPromise<R>> : never}[keyof T], never>;

type NonMerged<T> = T extends any ? {[K in keyof T as
	T[K] extends { new (...args: any): any } ? K
	: T[K] extends { get: (...args: any) => infer R } ? NoPromise<R> extends undefined ? never : NoPromise<R> extends MergeBase<any> ? never : K
	: K
]: ReadType<T[K]> } : never;


type AllKeys<T> = T extends any ? keyof T : never;
type FieldType<T, K extends PropertyKey> = T extends any ? K extends keyof T ? T[K] : never : never;
type OptionalKeys<T> = { [K in AllKeys<T>]: T extends any ? K extends keyof T ? never : K : never }[AllKeys<T>];
type MergeObject<T> = [T] extends [CorrelatedMerge<any>] ? StripMerge<T>
	: [T] extends [UnionToIntersection<T>]	? T
	: { [K in Exclude<AllKeys<T>, OptionalKeys<T>>]: FieldType<T, K> } & { [K in OptionalKeys<T>]?: FieldType<T, K> };

type MergeOverlap<A, B> = [A] extends [never]	? Exclude<B, undefined>
	: [Exclude<B, undefined>] extends [A]		? Exclude<B, undefined>
	: [A] extends [Exclude<B, undefined>]		? Exclude<B, undefined>
	: A | Exclude<B, undefined>;

type MergeResult<A, B> = {[K in keyof A]: K extends keyof B ? MergeOverlap<A[K], B[K]> : A[K]}
	& {[K in Exclude<keyof B, keyof A> as undefined extends B[K] ? K : never]?: B[K]}
	& {[K in Exclude<keyof B, keyof A> as undefined extends B[K] ? never : K]: B[K]};

export type ReadType<T> = T extends {new (s: infer _S extends common_stream): infer R} ? R
	: T extends { get: (s: any) => infer R } ? NoPromise<R>
	: T extends readonly unknown[] ? TupleReadType<T>
	: T extends object ? (
		[AllMerged<T>] extends [never]
			? NonMerged<T>
			: MergeResult<NonMerged<T>, MergeObject<AllMerged<T>>>
		) & ([AllCorrelated<T>] extends [never] ? unknown : AllCorrelated<T>)
	: never;
