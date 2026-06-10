import { BitInput, BitOutput, BitAdapterN, BitAdapterSigned, BitFieldDescriptor, BitFieldDescriptorAdapter, calcBits, isLittleEndian} from './bitfields'

interface BitViewer<T> {
	get(dv: DataView, offset: number): T;
	set(dv: DataView, offset: number, v: T): void;
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


export function bitsView<N extends number>(len: N, littleEndian?: boolean, fixedOffset?: number): BitViewer<bigint|number> {
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

function BitFieldsViewer<T extends BitFieldDescriptor>(desc: T, be = false, fixedOffset?: number): BitViewer<BitOutput<T>> {
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

function BitArrayViewer<C extends number, N extends number>(count: C, bits: N, be = false): BitViewer<BitInput<N>[]> {
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


export function Uint<N extends number>(bits: N, be?: boolean) {
	return BitViewerTypedArray(bits, BitViewerUnsigned(bits, be));
}

export function Int<N extends number>(bits: N, be?: boolean) {
	return BitViewerTypedArray(bits, BitViewerSigned(bits, be));
}

export function BitFields<T extends BitFieldDescriptor>(bitfields: T, be = false) {
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

export const Uint16be		= DataViewTypedArray('Uint16', true);		export type Uint16be	= InstanceType<typeof Uint16be>;
export const Uint32be		= DataViewTypedArray('Uint32', true);		export type Uint32be	= InstanceType<typeof Uint32be>;
export const BigUint64be	= DataViewTypedArray('BigUint64', true);	export type BigUint64be	= InstanceType<typeof BigUint64be>;
export const Int16be		= DataViewTypedArray('Int16', true);		export type Int16be		= InstanceType<typeof Int16be>;
export const Int32be		= DataViewTypedArray('Int32', true);		export type Int32be		= InstanceType<typeof Int32be>;
export const BigInt64be		= DataViewTypedArray('BigInt64', true);		export type BigInt64be	= InstanceType<typeof BigInt64be>;
export const Float32be		= DataViewTypedArray('Float32', true);		export type Float32be	= InstanceType<typeof Float32be>;
export const Float64be		= DataViewTypedArray('Float64', true);		export type Float64be	= InstanceType<typeof Float64be>;

export function make<T extends DataViewType>(length: number, type:T, be?: boolean) {
	const BYTES_PER_ELEMENT = typedArrays[type].BYTES_PER_ELEMENT ?? 1;
	const arrayType = be !== isLittleEndian ? typedArrays[type] : DataViewTypedArray(type, be);
	return new arrayType(new ArrayBuffer(length * BYTES_PER_ELEMENT), 0, length);
}

export function as<T extends DataViewType>(arg: TypedArray, type: T, be?: boolean): TypedArray<DataViewReturnType<T>>;
export function as<T extends DataViewType>(arg: TypedArray|undefined, type: T, be?: boolean): TypedArray<DataViewReturnType<T>>|undefined;
export function as(arg: TypedArray|undefined, type: DataViewType, be?: boolean) {
    if (!arg)
        return undefined;
	const BYTES_PER_ELEMENT = typedArrays[type].BYTES_PER_ELEMENT ?? 1;
	const arrayType = be !== isLittleEndian && arg.byteOffset % BYTES_PER_ELEMENT === 0 ? typedArrays[type] : DataViewTypedArray(type, be);
	return new arrayType(arg.buffer, arg.byteOffset, Math.floor(arg.byteLength / BYTES_PER_ELEMENT));
}

export function concatenate<T extends TypedArray>(buffers: T[]): T {
	const out 	= new ArrayBuffer(buffers.reduce((sum, buf) => sum + buf.byteLength, 0));
	const out8	= new Uint8Array(out);
	let offset = 0;
	for (const buf of buffers) {
		out8.set(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength), offset);
		offset += buf.byteLength;
	}
	return new (buffers[0].constructor as TypedArrayConstructor<T>)(out);
}
