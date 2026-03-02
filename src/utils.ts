
//-----------------------------------------------------------------------------
//	bit stuff
//-----------------------------------------------------------------------------

export function isPow2(n: number) {
	return (n & (n - 1)) === 0;
}
export function contiguousBits(n: number) {
	return isPow2(n + lowestSet(n));
}

export function lowestSet(n: number): number;
export function lowestSet(n: bigint): bigint;
export function lowestSet(n: number | bigint): number | bigint;
	export function lowestSet(n: number | bigint): number | bigint {
	return typeof n === 'bigint' ? n & -n : n & -n;
}

export function highestSetIndex32(n: number) {
	return 31 - Math.clz32(n);
}
export function highestSetIndex(n: number | bigint): number {
	return typeof n === 'bigint' || n > 2 ** 32
		? n.toString(2).length - 1
		: highestSetIndex32(n);
}

export function lowestSetIndex32(n: number) {
    return n ? 31 - Math.clz32(n & -n) : 32;
}

export function lowestSetIndex(n: number | bigint): number {
	if (n < 2 ** 32)
		return lowestSetIndex32(Number(n));
	n = BigInt(n);
	const i = Number(n & 0xffffffffn);
	return i ? lowestSetIndex32(i) : 32 + lowestSetIndex(n >> 32n);
}

export function clearLowest(n: number): number;
export function clearLowest(n: bigint): bigint;
export function clearLowest(n: number | bigint): number | bigint;
export function clearLowest(n: number | bigint)	{
	return typeof n === 'bigint'
		? n & (n - 1n)
		: n & (n - 1);
}

function bitCount32(n: number) {
	n = n - ((n >> 1) & 0x55555555);
	n = (n & 0x33333333) + ((n >> 2) & 0x33333333);
	return ((n + (n >> 4) & 0xF0F0F0F) * 0x1010101) >> 24;
}
export function bitCount(n: number | bigint) : number {
	return typeof n === 'bigint'
		? bitCount32(Number(n & 0xFFFFFFFFn)) + bitCount(n >> 32n)
		: bitCount32(n);
}

export function splitBinary(n : number | bigint, splits : number[]) {
    let b = 0;
	return typeof n === 'bigint'
		? splits.map(s => {
			const r = (n >> BigInt(b)) & ((1n << BigInt(s)) - 1n);
			b += s;
			return r;
		})
		: splits.map(s => {
			const r = (n >> b) & ((1 << s) - 1);
			b += s;
			return r;
		});
}

//-----------------------------------------------------------------------------
//	integers
//-----------------------------------------------------------------------------

// get/put 1-7 byte integers from/to DataView (7 bytes will lose precision)

export function getUint(dv: DataView, len: number, littleEndian?: boolean) {
	let result = 0;
	if (littleEndian) {
		if (len & 1)
			result = dv.getUint8(len & 6);
		if (len & 2)
			result = (result << 16) | dv.getUint16(len & 4, true);
		if (len & 4)
			result = result * (2**32) + dv.getUint32(0, true);
	} else {
		if (len & 1)
			result = dv.getUint8(0);
		if (len & 2)
			result = (result << 16) | dv.getUint16(len & 1);
		if (len & 4)
			result = result * (2**32) + dv.getUint32(len & 3);
	}
	return result;
}

export function getInt(dv: DataView, len: number, littleEndian?: boolean) {
	const v = getUint(dv, len, littleEndian);
	const s = 1 << len * 8 - 1;
	return v < s ? v : v - s - s;
}

export function putUint(dv: DataView, v: number, len: number, littleEndian?: boolean) {
	if (littleEndian) {
		if (len & 4) {
			dv.setUint32(0, v & 0xffffffff, true);
			v /= 2**32;
		}
		if (len & 2) {
			dv.setUint16(len & 4, v & 0xffff, true);
			v >>= 16;
		}
		if (len & 1)
			dv.setUint8(len & 6, v & 0xff);
	} else {
		if (len & 4) {
			dv.setUint32(len & 3, v & 0xffffffff);
			v /= 2**32;
		}
		if (len & 2) {
			dv.setUint16(len & 1, v & 0xffff);
			v >>= 16;
		}
		if (len & 1)
			dv.setUint8(0, v & 0xff);
	}
}

export function getBigUint(dv: DataView, len: number, littleEndian?: boolean) {
	let result = 0n;
	if (littleEndian) {
		let offset = len;
		while (offset >= 4) {
			offset -= 4;
			result = (result << 32n) | BigInt(dv.getUint32(offset, true));
		}
		if (len & 2) {
			offset -= 2;
			result = (result << 16n) | BigInt(dv.getUint16(offset, true));
		}
		if (len & 1)
			result = (result << 8n) | BigInt(dv.getUint8(--offset));
	} else {
		let offset = 0;
		while (offset + 4 <= len) {
			result = (result << 32n) | BigInt(dv.getUint32(offset));
			offset += 4;
		}
		if (len & 2) {
			result = (result << 16n) | BigInt(dv.getUint16(offset));
			offset += 2;
		}
		if (len & 1)
			result = (result << 8n) | BigInt(dv.getUint8(offset));
	}
	return result;
}

export function getBigInt(dv: DataView, len: number, littleEndian?: boolean) {
	const v = getBigUint(dv, len, littleEndian);
	const s = 1n << BigInt(len * 8 - 1);
	return v < s ? v : v - s - s;
}

export function putBigUint(dv: DataView, v: bigint, len: number, littleEndian?: boolean) {
	if (littleEndian) {
		let offset = 0;
		while (offset + 4 <= len) {
			dv.setUint32(offset, Number(v & 0xffffffffn), true);
			v >>= 32n;
			offset += 4;
		}
		if (len & 2) {
			dv.setUint16(offset, Number(v & 0xffffn), true);
			v >>= 16n;
			offset += 2;
		}
		if (len & 1)
			dv.setUint8(offset, Number(v & 0xffn));
	} else {
		let offset = len;
		while (offset >= 4) {
			offset -= 4;
			dv.setUint32(offset, Number(v & 0xffffffffn));
			v >>= 32n;
		}
		if (len & 2) {
			offset -= 2;
			dv.setUint16(offset, Number(v & 0xffffn));
			v >>= 16n;
		}
		if (len & 1)
			dv.setUint8(--offset, Number(v & 0xffn));
	}
}

//-----------------------------------------------------------------------------
//	float
//-----------------------------------------------------------------------------

function splitNumber(f: number) {
	const dv	= new DataView(new ArrayBuffer(8));
	dv.setFloat64(0, f, true);
	const bits0 = dv.getUint32(0, true);
	const bits1 = dv.getUint32(4, true);
	return {
		mantissa:	(bits1 & 0xFFFFF) * Math.pow(2, 32) + bits0,
		exp:		((bits1 >>> 20) & 0x7FF) - 1023,
		sign:		bits1 >>> 31,
	};
}
function makeNumber(mantissa: number, exp: number, sign = 0): number {
	const dv	= new DataView(new ArrayBuffer(8));
	dv.setUint32(0, mantissa >>> 0, true);
	dv.setUint32(4, (sign << 31) | ((exp + 1023) << 20) | ((mantissa / Math.pow(2, 32)) & 0xFFFFF), true);
	return dv.getFloat64(0, true);
}

interface FloatInstance<I extends number | bigint> {
	i: I;
	valueOf(): number;
}
interface FloatClass<I extends number | bigint> {
	new(value: number): FloatInstance<I>;
	new(mantissa: I, exponent: number, sign?: number): FloatInstance<I>;
	from(i: I): FloatInstance<I>;
}

export function Float(mbits: 10, ebits: 5, exp_bias?: number): FloatClass<number>;
export function Float(mbits: 24, ebits: 8, exp_bias?: number): FloatClass<number>;
export function Float(mbits: 52, ebits: 11, exp_bias?: number): FloatClass<number>;
export function Float(mbits: number, ebits: number, exp_bias?: number): FloatClass<number | bigint>;
export function Float<I extends number | bigint = number>(mbits: number, ebits: number, exp_bias = (1 << (ebits - 1)) - 1): FloatClass<I> {
	const useBigInt = mbits > 32;
	const emask = (1 << ebits) - 1;
	const mmask = useBigInt ? (1n << BigInt(mbits)) - 1n : (1 << mbits) - 1;
	
	const pack = useBigInt
		? (mantissa: number|bigint, exponent: number, sign: number) =>
			((BigInt((sign << ebits) | (exponent + exp_bias))) << BigInt(mbits) | (BigInt(mantissa) & mmask as bigint))
		: (mantissa: number|bigint, exponent: number, sign: number) =>
			(((sign << ebits) | (exponent + exp_bias)) << mbits) | (Number(mantissa) & mmask as number);

	const splitCommon = (mantissa: number | bigint, rest: number) => ({mantissa, exp: (rest & emask) - exp_bias, sign: rest >>> ebits});
	const split = useBigInt
		? (i: number|bigint) => {
			const n		= BigInt(i);
			return splitCommon(n & mmask as bigint, Number(n >> BigInt(mbits)));
		}
		: (i: number|bigint) => {
			const n		= Number(i);
			return splitCommon(n & mmask as number, n >> mbits);
		};

/*
	const prototype = {
		parts() {
			return split(this.i);
		},
		valueOf() {
			const {mantissa, exp, sign} = split(this.i);
			const m = mbits <= 52
				? Number(mantissa) * Math.pow(2, 52 - mbits)
				: Number(BigInt(mantissa) >> BigInt(mbits - 52));
			return makeNumber(m, exp, sign);
		},
		toString() {
			return this.valueOf().toString();
		},
	};
	const cons = function(this: any, x: number | I, exponent?: number, sign?: number) {
		if (typeof exponent === 'undefined') {
			const {mantissa, exp, sign: s} = splitNumber(x as number);
			const m = mbits <= 52
				? mantissa / Math.pow(2, 52 - mbits)
				: BigInt(mantissa) << BigInt(mbits - 52);
			this.i = pack(m as I, exp, s) as I;
		} else {
			this.i = pack(x as I, exponent, sign ?? 0) as I;
		}
	};
*/
	return class F {
		i: I;
		
		constructor(value: number);
		constructor(mantissa: I, exponent: number, sign?: number);
		constructor(x: I | number, exponent?: number, sign?: number) {
			if (typeof exponent === 'undefined') {
				const {mantissa, exp, sign: s} = splitNumber(x as number);
				const m = mbits <= 52
					? mantissa / Math.pow(2, 52 - mbits)
					: BigInt(mantissa) << BigInt(mbits - 52);
				this.i = pack(m as I, exp, s) as I;
			} else {
				this.i = pack(x as I, exponent, sign ?? 0) as I;
			}
		}
		static from(i: I) {
			const obj = Object.create(this.prototype) as F;
			obj.i = i;
			return obj;
		}
		parts() {
			return split(this.i);
		}
		valueOf() {
			const {mantissa, exp, sign} = split(this.i);
			const m = mbits <= 52
				? Number(mantissa) * Math.pow(2, 52 - mbits)
				: Number(BigInt(mantissa) >> BigInt(mbits - 52));
			return makeNumber(m, exp, sign);
		}
		toString() {
			return this.valueOf().toString();
		}
	};//as FloatClass<I>;
}

export const float8_e4m3 = Float(3, 4, 7);
export const float8_e5m2 = Float(2, 5, 15);
export const float16 = Float(10, 5, 15);

//-----------------------------------------------------------------------------
//	buffers
//-----------------------------------------------------------------------------

export const isLittleEndian = (new Uint8Array(new Uint16Array([0x1234]).buffer))[0] === 0x34;

export interface TypedArray<R = any> {
	buffer:			ArrayBufferLike;
	length:			number;
	byteLength:		number;
	byteOffset:		number;
    [n: number]:	R;
	[Symbol.iterator](): IterableIterator<R>;
	slice(begin:	number, end?: number): TypedArray<R>;
	subarray(begin: number, end?: number): TypedArray<R>;
	set(array: ArrayLike<R>, offset?: number): void;

	copyWithin:		MethodType<ArrayMethod<R, 'copyWithin'>, TypedArray<R>>
	every:			MethodType<ArrayMethod<R, 'every'>>
	fill:			MethodType<ArrayMethod<R, 'fill'>, TypedArray<R>>
	filter:			MethodType<ArrayMethod<R, 'filter'>>
	find:			MethodType<ArrayMethod<R, 'find'>>
	findIndex:		MethodType<ArrayMethod<R, 'findIndex'>>
	forEach:		MethodType<ArrayMethod<R, 'forEach'>>
	indexOf:		MethodType<ArrayMethod<R, 'indexOf'>>
	join:			MethodType<ArrayMethod<R, 'join'>>
	lastIndexOf:	MethodType<ArrayMethod<R, 'lastIndexOf'>>
	map:			MethodType<ArrayMethod<R, 'map'>>
	reduce:			MethodType<ArrayMethod<R, 'reduce'>>
	reduceRight:	MethodType<ArrayMethod<R, 'reduceRight'>>
	reverse:		MethodType<ArrayMethod<R, 'reverse'>, TypedArray<R>>
	some:			MethodType<ArrayMethod<R, 'some'>>
	sort:			MethodType<ArrayMethod<R, 'sort'>, TypedArray<R>>
	toString:		MethodType<ArrayMethod<R, 'toString'>>
}

export type TypedArrayConstructor<T extends TypedArray<R>, R>
	= (new(a: ArrayBufferLike, offset?: number, length?: number)=>T)
	& {BYTES_PER_ELEMENT?: number};

type DataViewType = 'Uint16' | 'Uint32' | 'BigUint64' | 'Int16' | 'Int32' | 'BigInt64' | 'Float32' | 'Float64';
type DataViewReturnType<T extends DataViewType> = T extends 'BigUint64' ? bigint : T extends 'BigInt64' ? bigint : number;

const typedArrays: Record<DataViewType, TypedArrayConstructor<TypedArray, any>> = {
	Uint16: 	Uint16Array,
	Int16: 		Int16Array,
	Uint32: 	Uint32Array,
	Int32: 		Int32Array,
	BigUint64: 	BigUint64Array,
	BigInt64: 	BigInt64Array,
	Float32: 	Float32Array,
	Float64: 	Float64Array,
} as const;

type ArrayMethod<R, F extends keyof Array<R>> = 
	F extends 'every' | 'filter' | 'find' | 'findIndex' | 'forEach' | 'map' | 'some'
	? (predicate: (value: R, index: number, array: ArrayLike<R>) => any, thisArg?: any) => any
	: F extends 'reduce' | 'reduceRight'
	? (callbackfn: (prev: R, curr: R, index: number, array: ArrayLike<R>) => R, initial?: R) => R
	: Array<R>[F];

type MethodParams<M> = M extends (...args: infer P) => any ? P : never;
type MethodReturn<M> = M extends (...args: any[]) => infer R ? R : never;
type MethodType<M, R = MethodReturn<M>>	= (...args: MethodParams<M>) => R;

function arrayFunc<R, F extends keyof Array<R>>(array: ArrayLike<R>, func: F, ...args: MethodParams<ArrayMethod<R, F>>): MethodReturn<ArrayMethod<R, F>> {
	return (Array.prototype[func] as any).call(array, ...args);
}

interface TypedArrayBacking<R> {
	byteLength : number;
	get(index: number): R;
	set(index: number, value: R): void;
};
type TypedArrayBackingFactory<R> = (buffer: ArrayBufferLike, byteOffset: number, length: number) => TypedArrayBacking<R>;

function DataViewTypedArray<T extends DataViewType>(type: T, be?: boolean) {
	const BYTES_PER_ELEMENT	= typedArrays[type].BYTES_PER_ELEMENT ?? 1;
	return TypedArray(
		(buffer: ArrayBufferLike, byteOffset: number, length: number) => {
			const byteLength = length * BYTES_PER_ELEMENT;
			const dv = new DataView(buffer, byteOffset, byteLength);
			const getter	= dv[`get${type}`].bind(dv) as (offset: number, littleEndian?: boolean) => DataViewReturnType<T>;
			const setter	= dv[`set${type}`].bind(dv) as (offset: number, value: DataViewReturnType<T>, littleEndian?: boolean) => void;
			return {
				byteLength,
				get: (index: number) => getter(index, !be),
				set: (index: number, value: DataViewReturnType<T>) => setter(index, value, !be),
			};
		},
		BYTES_PER_ELEMENT
	);
}

function TypedArray<R>(backingFactory: TypedArrayBackingFactory<R>, BYTES_PER_ELEMENT: number) {
	type THIS			= TypedArray<R>;
	type Callback<T>	= (value: R, index: number, array: THIS) => T;
	type Reduction		= (prev: R, curr: R, index: number, array: THIS) => R;

	const proto = {
		copyWithin(this: THIS, target: number, start: number, end?: number) { arrayFunc(this, 'copyWithin', target, start, end); return this; },
		every(this: THIS, predicate: Callback<boolean>, thisArg?: any) 		{ return arrayFunc(this, 'every', predicate as any, thisArg); },
		fill(this: THIS, value: R, start?: number, end?: number) 			{ arrayFunc(this, 'fill', value, start, end); return this;},
		filter(this: THIS, predicate: Callback<boolean>, thisArg?: any) 	{ return arrayFunc(this, 'filter', predicate as any, thisArg); },
		find(this: THIS, predicate: Callback<boolean>, thisArg?: any) 		{ return arrayFunc(this, 'find', predicate as any, thisArg); },
		findIndex(this: THIS, predicate: Callback<boolean>, thisArg?: any)	{ return arrayFunc(this, 'findIndex', predicate as any, thisArg); },
		forEach(this: THIS, callback: Callback<void>, thisArg?: any) 		{ return arrayFunc(this, 'forEach', callback as any, thisArg); },
		indexOf(this: THIS, searchElement: R, fromIndex?: number) 			{ return arrayFunc(this, 'indexOf', searchElement, fromIndex); },
		join(this: THIS, separator?: string) 								{ return arrayFunc(this, 'join', separator); },
		lastIndexOf(this: THIS, searchElement: R, fromIndex?: number) 		{ return arrayFunc(this, 'lastIndexOf', searchElement, fromIndex); },
		map(this: THIS, callback: Callback<R>, thisArg?: any) 				{ return arrayFunc(this, 'map', callback as any, thisArg); },
		reduce(this: THIS, callback: Reduction, initial?: R)				{ return arrayFunc(this, 'reduce', callback as any, initial); },
		reduceRight(this: THIS, callback: Reduction, initial?: R)			{ return arrayFunc(this, 'reduceRight', callback as any, initial); },
		reverse(this: THIS) 												{ arrayFunc(this, 'reverse'); return this; },
		some(this: THIS, predicate: Callback<boolean>, thisArg?: any)		{ return arrayFunc(this, 'some', predicate as any, thisArg); },
		sort(this: THIS, compare?: (a: R, b: R) => number) 					{ arrayFunc(this, 'sort', compare as any); return this; },
		toString(this: THIS) 												{ return arrayFunc(this, 'toString'); },
	};

	function make(buffer: ArrayBufferLike, byteOffset: number, length: number): TypedArray<R> {
		const backing = backingFactory(buffer, byteOffset, length);
		return new Proxy(Object.assign(Object.create(proto), {
			length,
			buffer,
			byteLength: backing.byteLength,
			byteOffset,
			slice(begin: number, end?: number) 			{ return make(buffer, byteOffset + begin * BYTES_PER_ELEMENT, (end ?? length) - begin); },
			subarray(begin: number, end?: number) 		{ return make(buffer, byteOffset + begin * BYTES_PER_ELEMENT, (end ?? length) - begin); },
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
				if (!isNaN(index) && index >= 0 && index < target.length)
					return backing.get(index);
				return undefined;
			},
			set(target, prop, value: R) {
				const index = Number(prop);
				if (!isNaN(index) && index >= 0 && index < target.length) {
					backing.set(index, value);
					return true;
				}
				return false;
			}
		}) as TypedArray<R>;
	}

	return Object.assign(function(a: ArrayBufferLike, offset?: number, length?: number) {
		return make(a, offset ?? 0, length ?? (a.byteLength - (offset ?? 0)) / BYTES_PER_ELEMENT);
	}, {
		BYTES_PER_ELEMENT
	}) as any as TypedArrayConstructor<TypedArray<R>, R>;
}

export const Uint16beArray		= DataViewTypedArray('Uint16', true);		export type Uint16beArray		= InstanceType<typeof Uint16beArray>;
export const Uint32beArray		= DataViewTypedArray('Uint32', true);		export type Uint32beArray		= InstanceType<typeof Uint32beArray>;
export const BigUint64beArray	= DataViewTypedArray('BigUint64', true);	export type BigUint64beArray	= InstanceType<typeof BigUint64beArray>;
export const Int16beArray		= DataViewTypedArray('Int16', true);		export type Int16beArray		= InstanceType<typeof Int16beArray>;
export const Int32beArray		= DataViewTypedArray('Int32', true);		export type Int32beArray		= InstanceType<typeof Int32beArray>;
export const BigInt64beArray	= DataViewTypedArray('BigInt64', true);		export type BigInt64beArray		= InstanceType<typeof BigInt64beArray>;
export const Float32beArray		= DataViewTypedArray('Float32', true);		export type Float32beArray		= InstanceType<typeof Float32beArray>;
export const Float64beArray		= DataViewTypedArray('Float64', true);		export type Float64beArray		= InstanceType<typeof Float64beArray>;

export const Float16Array		= TypedArray(
	(buffer: ArrayBufferLike, byteOffset: number, length: number) => {
		const dv = new DataView(buffer, byteOffset, length * 2);
		return {
			byteLength: length * 2,
			get: (index: number) => float16.from(dv.getUint16(index * 2, true)),
			set: (index: number, value: InstanceType<typeof float16>) => dv.setUint16(index * 2, value.i, true),
		};
	},
2);
export type Float16Array		= InstanceType<typeof Float16Array>;

function as<T extends DataViewType>(arg: TypedArray, type: T, be?: boolean) {
	const arrayType = be !== isLittleEndian ? typedArrays[type] : DataViewTypedArray(type, be);
	return new arrayType(arg.buffer, arg.byteOffset, arg.byteLength / (typedArrays[type].BYTES_PER_ELEMENT ?? 1));
}

// never copy, just reinterpret

export function as8(arg: TypedArray) : Uint8Array;
export function as8(arg?: TypedArray) : Uint8Array | undefined;
export function as8(arg?: TypedArray) { return arg && new Uint8Array(arg.buffer, arg.byteOffset, arg.byteLength); }

export function as16(arg: TypedArray, be?: boolean) : TypedArray<number>;
export function as16(arg?: TypedArray, be?: boolean) : TypedArray<number> | undefined;
export function as16(arg?: TypedArray, be?: boolean) : TypedArray<number> | undefined { return arg && as(arg, 'Uint16', be); }

export function as16s(arg: TypedArray, be?: boolean) : TypedArray<number>;
export function as16s(arg?: TypedArray, be?: boolean) : TypedArray<number> | undefined;
export function as16s(arg?: TypedArray, be?: boolean) : TypedArray<number> | undefined { return arg && as(arg, 'Int16', be); }

export function as32(arg: TypedArray, be?: boolean) : TypedArray<number>;
export function as32(arg?: TypedArray, be?: boolean) : TypedArray<number> | undefined;
export function as32(arg?: TypedArray, be?: boolean) : TypedArray<number> | undefined { return arg && as(arg, 'Uint32', be); }

export function as32s(arg: TypedArray, be?: boolean) : TypedArray<number>;
export function as32s(arg?: TypedArray, be?: boolean) : TypedArray<number> | undefined;
export function as32s(arg?: TypedArray, be?: boolean) : TypedArray<number> | undefined { return arg && as(arg, 'Int32', be); }

export function as64(arg: TypedArray, be?: boolean) : TypedArray<bigint>;
export function as64(arg?: TypedArray, be?: boolean) : TypedArray<bigint> | undefined;
export function as64(arg?: TypedArray, be?: boolean) : TypedArray<bigint> | undefined { return arg && as(arg, 'BigUint64', be); }

export function as64s(arg: TypedArray, be?: boolean) : TypedArray<bigint>;
export function as64s(arg?: TypedArray, be?: boolean) : TypedArray<bigint> | undefined;
export function as64s(arg?: TypedArray, be?: boolean) : TypedArray<bigint> | undefined { return arg && as(arg, 'BigInt64', be); }

export function asF32(arg: TypedArray, be?: boolean) : TypedArray<number>;
export function asF32(arg?: TypedArray, be?: boolean) : TypedArray<number> | undefined;
export function asF32(arg?: TypedArray, be?: boolean) : TypedArray<number> | undefined { return arg && as(arg, 'Float32', be); }

export function asF64(arg: TypedArray, be?: boolean) : TypedArray<number>;
export function asF64(arg?: TypedArray, be?: boolean) : TypedArray<number> | undefined;
export function asF64(arg?: TypedArray, be?: boolean) : TypedArray<number> | undefined { return arg && as(arg, 'Float64', be); }

function pairSwap(a: TypedArray) {
	for (let i = 0; i < a.length; i += 2)
		[a[i], a[i+1]] = [a[i+1], a[i]];
}

/*
function dupBuffer(arg: TypedArray) {
	const buffer = new ArrayBuffer(arg.byteLength);
	(new Uint8Array(buffer)).set(new Uint8Array(arg.buffer, arg.byteOffset, arg.byteLength));
	return buffer;
}


function fixEndian16(a: ArrayBuffer, be?: boolean) {
	if (be === isLittleEndian)
		pairSwap(new Uint8Array(a));
	return a;
}

function fixEndian32(a: ArrayBuffer, be?: boolean) {
	if (be === isLittleEndian) {
		pairSwap(new Uint8Array(a));
		pairSwap(new Uint16Array(a));
	}
	return a;
}

function fixEndian64(a: ArrayBuffer, be?: boolean) {
	if (be === isLittleEndian) {
		pairSwap(new Uint8Array(a));
		pairSwap(new Uint16Array(a));
		pairSwap(new Uint32Array(a));
	}
	return a;
}

// always copy to ensure we have a separate buffer

export function to8(arg: TypedArray) : Uint8Array<ArrayBuffer>;
export function to8(arg?: TypedArray) : Uint8Array | undefined;
//export function to8(arg?: arrayBuffer) { return arg && new Uint8Array(arg.buffer, arg.byteOffset, arg.byteLength); }
export function to8(arg?: TypedArray) { return arg && new Uint8Array(dupBuffer(arg)); }

export function to16(arg: TypedArray, be?: boolean) : Uint16Array;
export function to16(arg?: TypedArray, be?: boolean) : Uint16Array | undefined;
export function to16(arg?: TypedArray, be?: boolean) : Uint16Array | undefined { return arg && new Uint16Array(fixEndian16(dupBuffer(arg), be)); }
export function to16s(arg: TypedArray, be?: boolean) : Int16Array;
export function to16s(arg?: TypedArray, be?: boolean) : Int16Array | undefined;
export function to16s(arg?: TypedArray, be?: boolean) : Int16Array | undefined { return arg && new Int16Array(fixEndian16(dupBuffer(arg), be)); }

export function to32(arg: TypedArray, be?: boolean) : Uint32Array;
export function to32(arg?: TypedArray, be?: boolean) : Uint32Array | undefined;
export function to32(arg?: TypedArray, be?: boolean) : Uint32Array | undefined { return arg && new Uint32Array(fixEndian32(dupBuffer(arg), be)); }
export function to32s(arg: TypedArray, be?: boolean) : Int32Array;
export function to32s(arg?: TypedArray, be?: boolean) : Int32Array | undefined;
export function to32s(arg?: TypedArray, be?: boolean) : Int32Array | undefined { return arg && new Int32Array(fixEndian32(dupBuffer(arg), be)); }

export function to64(arg: TypedArray, be?: boolean) : BigUint64Array;
export function to64(arg?: TypedArray, be?: boolean) : BigUint64Array | undefined;
export function to64(arg?: TypedArray, be?: boolean) : BigUint64Array | undefined { return arg && new BigUint64Array(fixEndian64(dupBuffer(arg), be)); }
export function to64s(arg: TypedArray, be?: boolean) : BigInt64Array;
export function to64s(arg?: TypedArray, be?: boolean) : BigInt64Array | undefined;
export function to64s(arg?: TypedArray, be?: boolean) : BigInt64Array | undefined { return arg && new BigInt64Array(fixEndian64(dupBuffer(arg), be)); }


export function findValue(buf: Uint8Array | undefined, value = 0, size = 1, be?: boolean): number {
	return !buf ? 0
		: size === 1 ? buf.indexOf(value)
		: size === 2 ? (new Uint16Array(buf)).indexOf(value) * 2
		: size === 4 ? (new Uint32Array(buf)).indexOf(value) * 4
		: size === 8 ? (new BigInt64Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 8))).indexOf(BigInt(value)) * 8
		: 0;
}
*/
//-----------------------------------------------------------------------------
//	text
//-----------------------------------------------------------------------------

export type TextEncoding = 'utf8' | 'utf16le' | 'utf16be';

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
	if (bom)
		str = String.fromCharCode(0xfeff) + str;

	if (encoding === 'utf8')
		return new TextEncoder().encode(str);
	
	// utf16le or utf16be
	const len = str.length;
	const buf = new Uint8Array(len * 2);
	const view = new Uint16Array(buf.buffer);
	for (let i = 0; i < len; i++)
		view[i] = str.charCodeAt(i);
	
	if (encoding === 'utf16be')
		pairSwap(buf);
	
	return buf;
}

export function encodeTextInto(str: string, into: Uint8Array, encoding: TextEncoding, bom = false) {
	into.set(encodeText(str, encoding, bom));
}

export function decodeText(buf: Uint8Array, encoding: TextEncoding = 'utf8'): string {
	if (encoding === 'utf8')
		return new TextDecoder('utf-8').decode(buf);
	
	// utf16le (or swapped utf16be)
	const view = as16(buf, encoding === 'utf16be');	
	let result = '';
	for (let i = 0; i < view.length; i += 8192)
		result += String.fromCharCode(...view.subarray(i, i + 8192));
	return result;
}

export function decodeTextTo0(buf: Uint8Array | undefined, encoding: TextEncoding = 'utf8'): string {
	return buf ? decodeText(buf.subarray(0, encoding === 'utf8' ? buf.indexOf(0) : (new Uint16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2)).indexOf(0) * 2), encoding) : '';
}

export function getTextEncoding(bytes: Uint8Array): TextEncoding {
	return	bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF ?'utf8'
		:	bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF ? 'utf16be'
		:	bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE ? 'utf16le'
		:	bytes.length >= 2 && bytes[0] === 0 && bytes[1] !== 0 ? 'utf16be'
		:	bytes.length >= 2 && bytes[0] !== 0 && bytes[1] === 0 ? 'utf16le'
		: 	'utf8';
}
