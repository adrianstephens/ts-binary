import { UpTo52, SimpleAdapter, getUint, putUint, getBigUint, putBigUint } from '../common';

//-----------------------------------------------------------------------------
// bitfields adapter
//-----------------------------------------------------------------------------

export type BitInput<N>		= number extends N ? number | bigint : N extends 0 ? number | bigint : N extends UpTo52 ? number : bigint;
export type BitOutput<T>	= T extends number ? (T extends UpTo52 ? number : number extends T ? number | bigint : bigint)
	: T extends BitAdapterN<any, infer D> ? D
	: T extends ArrayDescriptor<any, infer D> ? BitOutput<D>[]
	: T extends object ? { [K in keyof T]: BitOutput<T[K]> }
	: never;

export type Descriptor =
    | number
    | BitAdapterN<any, any>
    | ObjectDescriptor
    | ArrayDescriptor<any, any>
    | DescriptorAdapter<any, any>;

interface ObjectDescriptor { [K: string]: Descriptor }
interface ArrayDescriptor<C extends number, T extends Descriptor> { length: C; descriptor: T; }

export interface DescriptorAdapter<T extends Descriptor, D> extends SimpleAdapter<BitOutput<T>, D>	{ descriptor: T; }
export interface BitAdapter<T extends number|bigint, D> extends SimpleAdapter<T, D>					{ bits: number;}
export interface BitAdapterN<N extends number, D> extends SimpleAdapter<BitInput<N>, D>				{ bits: N;}

export function calcBits(desc: Descriptor): number {
	if (typeof desc === 'number')
		return desc < 0 ? -desc : desc;

	if ('descriptor' in desc) {
		const bits = calcBits(desc.descriptor);
		return 'length' in desc ? bits * Number(desc.length) : bits;
	}

	const a = desc as BitAdapterN<any, any>;
	if (typeof a.bits === 'number')
		return a.bits;

	let total = 0;
	for (const key in desc)
		total += calcBits((desc as any)[key]);
	return total;
}

export function Array<C extends number, N extends number>(length: C, descriptor: N): ArrayDescriptor<C, N>;
export function Array<C extends number, T extends Descriptor>(length: C, descriptor: T): ArrayDescriptor<C, T>;
export function Array(length: number, descriptor: Descriptor) {
	return { length, descriptor };
}

export function Chain<D extends Descriptor, F>(base: D, adapter: SimpleAdapter<BitOutput<D>, F>): DescriptorAdapter<D, F> {
	return {...adapter, descriptor: base};
}

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

export function BitFields<N extends number, T extends Descriptor>(bits: N, desc: T): BitAdapterN<N, BitOutput<T>> {
	const total = calcBits(desc);
	if (bits === 0)
		bits = total as N;
	else if (bits < total)
		throw new Error(`BitFields: total bits of fields (${total}) exceed specified bits (${bits})`);

	if (typeof desc === 'number')
		return (desc < 0 ? BitAdapterSigned(-desc) : BitAdapterUnsigned(desc)) as unknown as BitAdapterN<N, BitOutput<T>>;
	
	//	adapter
	const a = desc as BitAdapterN<any, any>;
	if (typeof a.bits === 'number') {
		const base = BitAdapterUnsigned(a.bits);
		return {
			bits: base.bits,
			to:(x: number|bigint)	=> a.to(base.to(x)),
			from:(x: number|bigint)	=> base.from(a.from(x)),
		} as unknown as BitAdapterN<N, BitOutput<T>>;
	}

	if ('descriptor' in (desc as any)) {
		const a			= desc as DescriptorAdapter<any, any>;
		const adapter	= BitFields(0, a.descriptor);
		if ('length' in a) {
			//	arrays
			const length	= Number(a.length);
			const bits 		= adapter.bits;
			const mask		= (1n << BigInt(bits)) - 1n;
			return {
				bits: length * bits,
				to(v: number|bigint) {
					let x = BigInt(v);
					return new Proxy({}, {
						get(_target, prop) {
							if (prop === 'length')
								return length;
							const index = typeof prop === 'string' ? Number(prop) : NaN;
							if (!isNaN(index) && index >= 0 && index < length)
								return adapter.to((x >> BigInt(index * bits)) & mask);
							return undefined;
						},
						set(_target, prop, value) {
							const index = typeof prop === 'string' ? Number(prop) : NaN;
							if (!isNaN(index) && index >= 0 && index < length) {
								const v = (BigInt(value) & mask) << BigInt(index * bits);
								x = (x & ~(mask << BigInt(index * bits))) | BigInt(adapter.from(v));
								return true;
							}
							return false;
						}
					});
				},
				from(array: any[]) {
					let x	= 0n;
					for (let i = 0; i < length; i++)
						x |= (BigInt(array[i]) & mask) << BigInt(i * bits);
					return x;
				}
			} as any;
		}
		//	adapter
		return adapter as any;
	}


	//	object
	const bitfields:	Record<string, BitAdapterN<any, any>> = {};
	let offset = 0;
	for (const key in desc) {
		const value		= desc[key] as any;
		const adapter	= typeof value === 'number' ? (value < 0 ? BitAdapterSigned(-value) : BitAdapterUnsigned(value))
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

//-----------------------------------------------------------------------------
// bitfields viewer
//-----------------------------------------------------------------------------

export interface BitViewer<T> {
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

export function BitViewerUnsigned<N extends number>(bits: N, be = false, fixedOffset?: number): BitViewer<BitInput<N>> {
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

export function BitViewerSigned<N extends number>(bits: N, be = false, fixedOffset?: number): BitViewer<BitInput<N>> {
	const a = BitAdapterSigned(bits);
	const getter = bitsView(bits, !be, fixedOffset);
	return {
		get: (dv, offset)		=> a.to(getter.get(dv, offset) as BitInput<N>),
		set: (dv, offset, v)	=> getter.set(dv, offset, v)
	};
}

export function BitFieldsViewer<T extends Descriptor>(desc: T, be = false, fixedOffset?: number): BitViewer<BitOutput<T>> {
	if (typeof desc === 'number')
		return (desc < 0 ? BitViewerSigned(-desc, be, fixedOffset) : BitViewerUnsigned(desc, be, fixedOffset)) as BitViewer<BitOutput<T>>;

	if ('descriptor' in (desc as any)) {
		const b			= desc as DescriptorAdapter<any, any>;
		const viewer	= BitFieldsViewer(b.descriptor);
		if ('length' in b) {
			const length	= Number(b.length);
			const bits		= calcBits(b.descriptor);
			return {
				get(dv: DataView, offset: number) {
					return new Proxy({}, {
						get(_target, prop) {
							if (prop === 'length')
								return length;
							const index = typeof prop === 'string' ? Number(prop) : NaN;
							if (!isNaN(index) && index >= 0 && index < length)
								return viewer.get(dv, offset + index * bits);
							return undefined;
						},
						set(_target, prop, value) {
							const index = typeof prop === 'string' ? Number(prop) : NaN;
							if (!isNaN(index) && index >= 0 && index < length) {
								viewer.set(dv, offset + index * bits, value);
								return true;
							}
							return false;
						}
					}) as any;
				},
				set(dv: DataView, offset: number, v) {
					for (let i = 0; i < length; i++)
						viewer.set(dv, offset + i * bits, v[i]);
				}
			};
		}
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
