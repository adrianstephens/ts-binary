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
//	buffers
//-----------------------------------------------------------------------------
export const isLittleEndian = (new Uint8Array(new Uint16Array([0x1234]).buffer))[0] === 0x34;

export interface arrayBuffer<T = any> {
	length:			number;
	buffer:			ArrayBufferLike;
	byteLength:		number;
	byteOffset:		number;
	slice(begin:	number, end?: number): arrayBuffer<T>;
	subarray(begin: number, end?: number): arrayBuffer<T>;
    [n: number]:	T;
	[Symbol.iterator](): IterableIterator<T>;
}

export type bufferView<T extends arrayBuffer<R>, R> = (new(a: ArrayBufferLike, offset?: number, length?: number)=>T) & {BYTES_PER_ELEMENT?: number};

type DataViewType = 'Uint16' | 'Uint32' | 'BigUint64' | 'Int16' | 'Int32' | 'BigInt64' | 'Float32' | 'Float64';
type DataViewTypeGet<T extends DataViewType> = `get${T}`;
type DataViewTypeSet<T extends DataViewType> = `set${T}`;
type DataViewReturnType<T extends DataViewType> = T extends 'BigUint64' ? bigint : T extends 'BigInt64' ? bigint : number;

const bufferViews: Record<DataViewType, [bufferView<arrayBuffer, any>, number]> = {
	Uint16: 	[Uint16Array,		2],
	Int16: 		[Int16Array,		2],
	Uint32: 	[Uint32Array,		4],
	Int32: 		[Int32Array,		4],
	BigUint64: 	[BigUint64Array,	8],
	BigInt64: 	[BigInt64Array,		8],
	Float32: 	[Float32Array,		4],
	Float64: 	[Float64Array,		8],
} as const;

function as<T extends DataViewType>(arg: arrayBuffer, type: T, be?: boolean) {
	if (be !== isLittleEndian)
		return new (bufferViews[type][0])(arg.buffer, arg.byteOffset, arg.byteLength);

	const get		= `get${type}` as DataViewTypeGet<T>;
	const set		= `set${type}` as DataViewTypeSet<T>;
	const dv		= new DataView(arg.buffer, arg.byteOffset, arg.byteLength);
	const stride	= bufferViews[type][1];
	const littleEndian = be === undefined ? undefined : !be;

	return new Proxy({
		length:    	arg.length,
		buffer:    	arg.buffer,
		byteLength:	arg.byteLength,
		byteOffset:	arg.byteOffset,
		slice:     	(begin: number, end?: number) => arg.slice(begin, end),
		subarray:  	(begin: number, end?: number) => arg.subarray(begin, end),
	}, {
		get(target, prop) {
			if (prop in target)
				return target[prop as keyof typeof target];

			const index = Number(prop);
			if (!isNaN(index) && index >= 0 && index < target.length)
				return dv[get](index * stride, littleEndian);
			return undefined;
		},
		set(target, prop, value: DataViewReturnType<T>) {
			const index = Number(prop);
			if (!isNaN(index) && index >= 0 && index < target.length) {
				(dv[set] as any)(index * stride, value, littleEndian);
				return true;
			}
			return false;
		}
	}) as arrayBuffer<DataViewReturnType<T>>;
}

// never copy, just reinterpret

export function as8(arg: arrayBuffer) : Uint8Array;
export function as8(arg?: arrayBuffer) : Uint8Array | undefined;
export function as8(arg?: arrayBuffer) { return arg && new Uint8Array(arg.buffer, arg.byteOffset, arg.byteLength); }

export function as16(arg: arrayBuffer, be?: boolean) : arrayBuffer;
export function as16(arg?: arrayBuffer, be?: boolean) : arrayBuffer | undefined;
export function as16(arg?: arrayBuffer, be?: boolean) : arrayBuffer | undefined { return arg && as(arg, 'Uint16', be); }

export function as16s(arg: arrayBuffer, be?: boolean) : arrayBuffer;
export function as16s(arg?: arrayBuffer, be?: boolean) : arrayBuffer | undefined;
export function as16s(arg?: arrayBuffer, be?: boolean) : arrayBuffer | undefined { return arg && as(arg, 'Int16', be); }

export function as32(arg: arrayBuffer, be?: boolean) : arrayBuffer;
export function as32(arg?: arrayBuffer, be?: boolean) : arrayBuffer | undefined;
export function as32(arg?: arrayBuffer, be?: boolean) : arrayBuffer | undefined { return arg && as(arg, 'Uint32', be); }

export function as32s(arg: arrayBuffer, be?: boolean) : arrayBuffer;
export function as32s(arg?: arrayBuffer, be?: boolean) : arrayBuffer | undefined;
export function as32s(arg?: arrayBuffer, be?: boolean) : arrayBuffer | undefined { return arg && as(arg, 'Int32', be); }

export function as64(arg: arrayBuffer, be?: boolean) : arrayBuffer;
export function as64(arg?: arrayBuffer, be?: boolean) : arrayBuffer | undefined;
export function as64(arg?: arrayBuffer, be?: boolean) : arrayBuffer | undefined { return arg && as(arg, 'BigUint64', be); }

export function as64s(arg: arrayBuffer, be?: boolean) : arrayBuffer;
export function as64s(arg?: arrayBuffer, be?: boolean) : arrayBuffer | undefined;
export function as64s(arg?: arrayBuffer, be?: boolean) : arrayBuffer | undefined { return arg && as(arg, 'BigInt64', be); }

export function asF32(arg: arrayBuffer, be?: boolean) : arrayBuffer;
export function asF32(arg?: arrayBuffer, be?: boolean) : arrayBuffer | undefined;
export function asF32(arg?: arrayBuffer, be?: boolean) : arrayBuffer | undefined { return arg && as(arg, 'Float32', be); }

export function asF64(arg: arrayBuffer, be?: boolean) : arrayBuffer;
export function asF64(arg?: arrayBuffer, be?: boolean) : arrayBuffer | undefined;
export function asF64(arg?: arrayBuffer, be?: boolean) : arrayBuffer | undefined { return arg && as(arg, 'Float64', be); }

function dupBuffer(arg: arrayBuffer) {
	const buffer = new ArrayBuffer(arg.byteLength);
	(new Uint8Array(buffer)).set(new Uint8Array(arg.buffer, arg.byteOffset, arg.byteLength));
	return buffer;
}

function pairSwap(a: arrayBuffer) {
	for (let i = 0; i < a.length; i += 2)
		[a[i], a[i+1]] = [a[i+1], a[i]];
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

export function to8(arg: arrayBuffer) : Uint8Array<ArrayBuffer>;
export function to8(arg?: arrayBuffer) : Uint8Array | undefined;
//export function to8(arg?: arrayBuffer) { return arg && new Uint8Array(arg.buffer, arg.byteOffset, arg.byteLength); }
export function to8(arg?: arrayBuffer) { return arg && new Uint8Array(dupBuffer(arg)); }

export function to16(arg: arrayBuffer, be?: boolean) : Uint16Array;
export function to16(arg?: arrayBuffer, be?: boolean) : Uint16Array | undefined;
export function to16(arg?: arrayBuffer, be?: boolean) : Uint16Array | undefined { return arg && new Uint16Array(fixEndian16(dupBuffer(arg), be)); }
export function to16s(arg: arrayBuffer, be?: boolean) : Int16Array;
export function to16s(arg?: arrayBuffer, be?: boolean) : Int16Array | undefined;
export function to16s(arg?: arrayBuffer, be?: boolean) : Int16Array | undefined { return arg && new Int16Array(fixEndian16(dupBuffer(arg), be)); }

export function to32(arg: arrayBuffer, be?: boolean) : Uint32Array;
export function to32(arg?: arrayBuffer, be?: boolean) : Uint32Array | undefined;
export function to32(arg?: arrayBuffer, be?: boolean) : Uint32Array | undefined { return arg && new Uint32Array(fixEndian32(dupBuffer(arg), be)); }
export function to32s(arg: arrayBuffer, be?: boolean) : Int32Array;
export function to32s(arg?: arrayBuffer, be?: boolean) : Int32Array | undefined;
export function to32s(arg?: arrayBuffer, be?: boolean) : Int32Array | undefined { return arg && new Int32Array(fixEndian32(dupBuffer(arg), be)); }

export function to64(arg: arrayBuffer, be?: boolean) : BigUint64Array;
export function to64(arg?: arrayBuffer, be?: boolean) : BigUint64Array | undefined;
export function to64(arg?: arrayBuffer, be?: boolean) : BigUint64Array | undefined { return arg && new BigUint64Array(fixEndian64(dupBuffer(arg), be)); }
export function to64s(arg: arrayBuffer, be?: boolean) : BigInt64Array;
export function to64s(arg?: arrayBuffer, be?: boolean) : BigInt64Array | undefined;
export function to64s(arg?: arrayBuffer, be?: boolean) : BigInt64Array | undefined { return arg && new BigInt64Array(fixEndian64(dupBuffer(arg), be)); }


export function findValue(buf: Uint8Array | undefined, value = 0, size = 1/*, be?: boolean*/): number {
	return !buf ? 0
		: size === 1 ? buf.indexOf(value)
		: size === 2 ? (new Uint16Array(buf)).indexOf(value) * 2
		: size === 4 ? (new Uint32Array(buf)).indexOf(value) * 4
		: size === 8 ? (new BigInt64Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 8))).indexOf(BigInt(value)) * 8
		: 0;
}

//-----------------------------------------------------------------------------
//	numbers
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
