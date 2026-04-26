import * as utils from './utils';
import * as async from './async';
import * as sync from './sync';
import { after, tryAfter, MaybePromise, TypedArray, ViewMaker, ViewInstance } from './utils';
import { _stream, ReadType, MergeType, CorrelatedMerge, isReader, measure } from './sync';
import { get, put, TypeT, TypeX, Type, read, write, readn, writen,  makex } from './interop';

//-----------------------------------------------------------------------------
//	non-reading types (don't need async)
//-----------------------------------------------------------------------------

export interface TypeT0<T> {
	get(s: _stream|async._stream): T;
	put(s: _stream|async._stream, v: T): void;
}

/**
 *  @deprecated, use AfterSkip instead
 */
export function SkipType(len: number): TypeT0<void> {
	return {
		get: s => s.skip(len),
		put: s => s.skip(len)
	};
}

/**
 *  @deprecated, use Aligned instead
 */
export function AlignType(align: number): TypeT0<void> {
	return {
		get: s => s.align(align),
		put: s => s.align(align)
	};
}

/**
 *  @deprecated, use Const<undefined> instead
 */
export function DontRead<T>(): TypeT0<T|undefined> {
	return {
		get: _s => undefined,
		put: _s => undefined
	};
}

export function Const<T>(t: T): TypeT0<T> {
	return {
		get: _s => t,
		put: (_s, _v) => undefined
	};
}

export function SyncFunc<T>(func: (s: _stream, v?: T)=>T): sync.TypeT<T> {
	return {
		get: s => func(s),
		put: (s, v) => func(s, v)
	};
}

export function Func<T>(func: (s: _stream, v?: T)=>T): sync.TypeT<T>;
export function Func<T>(func: (s: _stream|async._stream, v?: T)=>MaybePromise<T>): TypeT<T>;
export function Func(func: (s: any, v?: any)=>any) {
	return {
		get: (s: any) => func(s),
		put: (s: any, v: any) => func(s, v)
	};
}

export function SyncFuncType<T extends sync.Type | undefined>(func: (s: _stream, v?: T)=>T): sync.TypeT<ReadType<T> | undefined> {
	return {
		get: s => { const t = func(s); if (t !== undefined) return read(s, t); },
		put: (s, v) => { const t = func(s, v); return t && write(s, t, v); }
	};
}

export function FuncType<T extends sync.Type | undefined>(func: (s: _stream, v?: T)=>T): sync.TypeT<ReadType<T> | undefined>;
export function FuncType<T extends Type | undefined>(func: (s: _stream|async._stream, v?: T)=>MaybePromise<T>): TypeT<ReadType<T> | undefined>;
export function FuncType(func: (s: any, v?: any)=>any) {
	return {
		get: (s: any) => after(func(s), t=> t && read(s, t)),
		put: (s: any, v: any) => after(func(s), t => t && write(s, t, v))
	};
}
export function Discard(type: Type): TypeT<undefined> {
	return {
		get: (s => after(read(s, type), () => undefined)) as get<undefined>,
		put: ((_s, _v) => undefined) as put<undefined>
	};
}

export function Expect<T extends Type>(type: T, t: ReadType<T>): TypeT<undefined> {
	return {
		get: (s => after(read(s, type), x => {
			if (x !== t)
				throw new Error(`Expected ${t}, got ${x}`);
			return undefined;
		})) as get<undefined>,
		put: (s => write(s, type, t)) as put<undefined>
	};
}
export function Struct<T extends Type>(spec: T): TypeT<ReadType<T>> {
	return {
		get:(s => read(s, spec)) as get<ReadType<T>>,
		put:((s, v) => write(s, spec, v)) as put<ReadType<T>>
	};
}

export function ReadOnly<T extends Type>(spec: T): TypeT<ReadType<T>> {
	return {
		get:(s => read(s, spec)) as get<ReadType<T>>,
		put:((_s, _v) => undefined) as put<ReadType<T>>
	};
}

//-----------------------------------------------------------------------------
//	numeric types
//-----------------------------------------------------------------------------

//type TypeNumber<T extends number> = T extends 8 | 16 | 24 | 32 | 40 | 48 | 56
//	? TypeT<number>
//	: TypeT<bigint>;

//type TypeNumber2<T extends number> = TypeT2<utils.NumericType<T>>;

type TypeNumber2<N extends number> = number extends N ? TypeT<number | bigint>
	: N extends 8 | 16 | 24 | 32 | 40 | 48 | 56 ? TypeT<number>
	: TypeT<bigint>;

function endian_from_stream<T extends number | bigint>(type: (be?: boolean)=>TypeT<T>): TypeT<T> {
	return {
		get: ((s => type(s.be).get(s as any)) as get<T>),
		put: ((s, v) => type(s.be).put(s as any, v)) as put<T>,
	};
}

function endian<T extends number | bigint>(type: (be?: boolean)=>TypeT<T>, be?: boolean) {
	return be === undefined ? endian_from_stream(type) : type(be);
}


//8 bit
export const UINT8: TypeT<number> = {
	get: ((s => after(s.view(DataView, 1), dv => dv.getUint8(0))) as get<number>),
	put: ((s, v) => after(s.view(DataView, 1), dv => dv.setUint8(0, v))) as put<number>,
};
export const INT8: TypeT<number> = {
	get: ((s => after(s.view(DataView, 1), dv => dv.getInt8(0))) as get<number>),
	put: ((s, v) => after(s.view(DataView, 1), dv => dv.setInt8(0, v))) as put<number>,
};

//16 bit
function _UINT16(be?: boolean): TypeT<number> { return {
	get: ((s => after(s.view(DataView, 2), dv => dv.getUint16(0, !be))) as get<number>),
	put: ((s, v) => after(s.view(DataView, 2), dv => dv.setUint16(0, v, !be))) as put<number>,
};};
function _INT16(be?: boolean): TypeT<number> { return {
	get: ((s => after(s.view(DataView, 2), dv => dv.getInt16(0, !be))) as get<number>),
	put: ((s, v) => after(s.view(DataView, 2), dv => dv.setInt16(0, v, !be))) as put<number>,
};};
export const UINT16_LE	= _UINT16(false), UINT16_BE = _UINT16(true), INT16_LE = _INT16(false), INT16_BE = _INT16(true);
export const UINT16		= endian_from_stream(_UINT16), INT16 = endian_from_stream(_INT16);

//32 bit
function _UINT32(be?: boolean): TypeT<number> { return {
	get: ((s => after(s.view(DataView, 4), dv => dv.getUint32(0, !be))) as get<number>),
	put: ((s, v) => after(s.view(DataView, 4), dv => dv.setUint32(0, v, !be))) as put<number>,
};};
function _INT32(be?: boolean): TypeT<number> { return {
	get: ((s => after(s.view(DataView, 4), dv => dv.getInt32(0, !be))) as get<number>),
	put: ((s, v) => after(s.view(DataView, 4), dv => dv.setInt32(0, v, !be))) as put<number>,
};};
export const UINT32_LE	= _UINT32(false), UINT32_BE = _UINT32(true), INT32_LE = _INT32(false), INT32_BE = _INT32(true);
export const UINT32 	= endian_from_stream(_UINT32), INT32 = endian_from_stream(_INT32);

//64 bit
/* // before BigInt was widely supported
function _UINT64(be?: boolean): TypeT2<bigint> { return {
	get: ((s => after(s.view(DataView, 8), dv => utils.getBigUint(dv, 0, 8, !be))) as get2<bigint>),
	put: ((s, v) => after(s.view(DataView, 8), dv => utils.putBigUint(dv, 0, v, 8, !be))) as put2<bigint>,
};};
function _INT64(be?: boolean): TypeT2<bigint> { return {
	get: ((s => after(s.view(DataView, 8), dv => utils.toSignedBig(utils.getBigUint(dv, 0, 8, !be), 64))) as get2<bigint>),
	put: ((s, v) => after(s.view(DataView, 8), dv => utils.putBigUint(dv, 0, v, 8, !be))) as put2<bigint>,
};};
*/
function _UINT64(be?: boolean): TypeT<bigint> { return {
	get: ((s => after(s.view(DataView, 8), dv => dv.getBigUint64(0, !be))) as get<bigint>),
	put: ((s, v) => after(s.view(DataView, 8), dv => dv.setBigUint64(0, v, !be))) as put<bigint>,
};};
function _INT64(be?: boolean): TypeT<bigint> { return {
	get: ((s => after(s.view(DataView, 8), dv => dv.getBigInt64(0, !be))) as get<bigint>),
	put: ((s, v) => after(s.view(DataView, 8), dv => dv.setBigInt64(0, v, !be))) as put<bigint>,
};};

export const UINT64_LE	= _UINT64(false), UINT64_BE = _UINT64(true), INT64_LE = _INT64(false), INT64_BE = _INT64(true);
export const UINT64		= endian_from_stream(_UINT64), INT64 = endian_from_stream(_INT64);

//computed int
export function UINT<N extends number>(bits: N | TypeX<number>, be?: boolean): TypeNumber2<N> {
	if (typeof bits === 'number') {
		if (bits & 7)
			throw new Error('bits must be multiple of 8');

		return (bits === 8 ? UINT8
			: bits > 56
			? endian((be?: boolean) => ({
				get: (s => after(s.view(DataView, bits / 8), dv => utils.getBigUint(dv, 0, bits / 8, !be))) as get<bigint>,
				put: ((s, v) => after(s.view(DataView, bits / 8), dv => utils.putBigUint(dv, 0, v, bits / 8, !be))) as put<bigint>
			}), be)
			: endian(bits == 16 ? _UINT16 : bits == 32 ? _UINT32 :
			(be?: boolean) => ({
				get: (s => after(s.view(DataView, bits / 8), dv => utils.getUint(dv, 0, bits / 8, !be))) as get<number>,
				put: ((s, v) => after(s.view(DataView, bits / 8), dv => utils.putUint(dv, 0, v, bits / 8, !be))) as put<number>
			}), be)
		) as TypeNumber2<N>;
	} else {
		const x = makex(bits);
		return endian((be?: boolean) => ({
			get: (
				s		=> after(x.get(s),
				bits	=> after(s.view(DataView, (bits + 7) >> 3),
				dv		=> utils.getBigUintBits(dv, 0, bits, !be)
			))) as get<number|bigint>,
			put: (
				(s, v)	=> after(x.put(s, utils.highestSetIndex(v)),
				bits	=> after(s.view(DataView, (bits + 7) >> 3),
				dv		=> utils.putBigUintBits(dv, 0, BigInt(v), bits, !be)
			))) as put<number|bigint>
		}), be) as TypeNumber2<N>;
	}
}

export function INT<N extends number>(bits: N | TypeX<number>, be?: boolean): TypeNumber2<N> {
	if (typeof bits === 'number') {
		if (bits & 7)
			throw new Error('bits must be multiple of 8');

		return (bits === 8 ? UINT8
			: bits > 56
			? endian((be?: boolean) => ({
				get: (s => after(s.view(DataView, bits / 8), dv => utils.toSignedBig(utils.getBigUint(dv, 0, bits / 8, !be), bits))) as get<bigint>,
				put: ((s, v) => after(s.view(DataView, bits / 8), dv => utils.putBigUint(dv, 0, v, bits / 8, !be))) as put<bigint>
			}), be)
			: endian(bits == 16 ? _INT16 : bits == 32 ? _INT32 :
			(be?: boolean) => ({
				get: (s => after(s.view(DataView, bits / 8), dv => utils.toSigned(utils.getUint(dv, 0, bits / 8, !be), bits))) as get<number>,
				put: ((s, v) => after(s.view(DataView, bits / 8), dv => utils.putUint(dv, 0, v, bits / 8, !be))) as put<number>
			}), be)
		) as TypeNumber2<N>;
	} else {
		const x = makex(bits);
		return endian((be?: boolean) => ({
			get: (
				s		=> after(x.get(s),
				bits	=> after(s.view(DataView, (bits + 7) >> 3),
				dv		=> utils.toSignedBig(utils.getBigUintBits(dv, 0, bits, !be), bits)
			))) as get<number|bigint>,
			put: (
				(s, v)	=> after(x.put(s, utils.highestSetIndex(v < 0 ? -v : v)),
				bits	=> after(s.view(DataView, (bits + 7) >> 3),
				dv		=> utils.putBigUintBits(dv, 0, BigInt(v), bits, !be)
			))) as put<number|bigint>
		}), be) as TypeNumber2<N>;
	
	}
}

//float
function _Float32(be?: boolean): TypeT<number> { return {
	get: ((s => after(s.view(DataView, 4), dv => dv.getFloat32(0, !be))) as get<number>),
	put: ((s, v) => after(s.view(DataView, 4), dv => dv.setFloat32(0, v, !be))) as put<number>
};};
function _Float64(be?: boolean): TypeT<number> { return {
	get: ((s => after(s.view(DataView, 8), dv => dv.getFloat64(0, !be))) as get<number>),
	put: ((s, v) => after(s.view(DataView, 8), dv => dv.setFloat64(0, v, !be))) as put<number>
};};
export const Float32	= endian_from_stream(_Float32), Float32_LE = _Float32(false), Float32_BE = _Float32(true);
export const Float64	= endian_from_stream(_Float64), Float64_LE = _Float64(false), Float64_BE = _Float64(true);

export function Float(mbits: number, ebits: number, ebias = (1 << (ebits - 1)) - 1, sbit = true, be?: boolean)	{
	if (sbit && mbits === 52 && ebits === 11 && ebias === 1023)
		return endian(_Float64, be);
	if (sbit && mbits === 23 && ebits === 8 && ebias === 127)
		return endian(_Float32, be);
	const F = utils.Float(mbits, ebits, ebias, sbit);
	return as(UINT(F.bits, be), x => +F.to(x), y => F(y).raw as any);
}

export function FloatRaw(mbits: number, ebits: number, ebias = (1 << (ebits - 1)) - 1, sbit = true, be?: boolean)	{
	const F = utils.Float(mbits, ebits, ebias, sbit);
	return as(UINT(F.bits, be), x => F.to(x), y => F(+y).raw as any);
}
export const Float16	= Float(10, 5, 15, true), Float16_LE = Float(10, 5, 15, true, false), Float16_BE = Float(10, 5, 15, true, true);

//leb128
export const ULEB128: TypeT<number|bigint> = {
	get: (s => after(s.view(Uint8Array, 16, false), buffer => {
		let t = 0;
		let	i = 0;
		let b;
		while ((b = buffer[i]) & 0x80 && i < 6)
			t |= (b & 0x7f) << (i++ * 7);

		t |= (b & 0x7f) << (i * 7);
		if (!(b & 0x80)) {
			s.skip(i + 1 - 16);
			return t;
		}
		let tn = BigInt(t);
		while ((b = buffer[i]) & 0x80)
			tn |= BigInt(b & 0x7f) << BigInt(i++ * 7);
		tn |= BigInt(b) << BigInt(i * 7);
		s.skip(i + 1 - 16);
		return tn;
	})) as get<number|bigint>,

	put: ((s, v) => {
		const buffer = new Uint8Array(Math.floor(utils.highestSetIndex(v) / 7) + 1);
		let i = 0;
		if (typeof v === 'number') {
			while (v > 127) {
				buffer[i++] = (v & 0x7f) | 0x80;
				v >>= 7;
			}
		} else {
			while (v > 127) {
				buffer[i++] = Number(v & 0x7fn) | 0x80;
				v >>= 7n;
			}
		}
		buffer[i++] = Number(v);
		return after(s.view(Uint8Array, buffer.length), v => v.set(buffer));
	}) as put<number|bigint>,
};

//-----------------------------------------------------------------------------
//	string types
//-----------------------------------------------------------------------------

export function String(len: TypeX<number>, encoding: utils.TextEncoding = 'utf8', zeroTerminated = false, lenScale?: number): TypeT<string> {
	const rawScale	= utils.bytesPerCharacter[encoding];
	const lenScale2	= lenScale ?? rawScale;
	const x = makex(len);
	return {
		get: ((s => after(x.get(s),
			len2 => after(s.view(Uint8Array, len2 * lenScale2),
			buff => {
				const v = utils.decodeText(buff, encoding);
				const z = zeroTerminated ? v.indexOf('\0') : -1;
				return z >= 0 ? v.substring(0, z) : v;
			})
		)) as get<string>),
		put: ((s, v) => {
			if (zeroTerminated)
				v += '\0';
			return after(x.put(s, v.length * rawScale / lenScale2),
				len2 => after(s.view(Uint8Array, len2 * lenScale2),
				buff => buff.set(utils.encodeText(v, encoding))
			));
		}) as put<string>,
	};
}

function find0(s: _stream|async._stream, view: ViewMaker<TypedArray<number>>) {
	const tell = s.tell();

	const chunk = (scanned: number, nextSize: number): any => after(
		s.view(view, nextSize, false),
		data => {
			const nullIndex = data.indexOf(0, scanned);
			s.seek(tell);
			if (nullIndex >= 0)
				return nullIndex + 1;
			if (data.length < nextSize)
				throw new Error('Null terminator not found');
			return chunk(nextSize, nextSize * 2);
		}
	);
	return chunk(0, 16);
}

export function NullTerminatedString(encoding: utils.TextEncoding = 'utf8'): TypeT<string> {
	const bpc 		= utils.bytesPerCharacter[encoding];
	const viewType	= bpc === 1 ? Uint8Array : bpc === 2 ? Uint16Array : Uint32Array;
	return String(
		(s, v?: number) => v === undefined ? find0(s, viewType) : v,
		encoding, true, 1
	);
};

export function RemainingString(encoding: utils.TextEncoding = 'utf8', zeroTerminated = false): TypeT<string> {
	return {
		get: (s => after(s.remainder(), r => utils.decodeText(r, encoding))) as get<string>,
		put: ((s, v) => {
			if (zeroTerminated)
				v += '\0';
			const encoded = utils.encodeText(v, encoding);
			return after(s.view(Uint8Array, encoded.length), buffer => buffer.set(encoded));
		}) as put<string>,
	};
}
/**
 *  @deprecated, use String instead
 */
export const StringType = String;
/**
 *  @deprecated, use NullTerminatedString instead
 */
export const NullTerminatedStringType = NullTerminatedString;
/**
 *  @deprecated, use RemainingString instead
 */
export const RemainingStringType = RemainingString;

//-----------------------------------------------------------------------------
//	array types
//-----------------------------------------------------------------------------

export function Array<T extends Type>(len: TypeX<number>, type: T): TypeT<ReadType<T>[]> {
	const x = makex(len);
	type R = ReadType<T>[];
	return {
		get: ((s => after(x.get(s), n => readn(s, type, n))) as get<R>) as get<R>,
		put: ((s, v) => after(x.put(s, v.length), () => writen(s, type, v))) as put<R>
	};
}

export function RemainingArray<T extends Type>(type: T): TypeT<NonNullable<ReadType<T>>[]> {
	type R = NonNullable<ReadType<T>>;
	return {
		get: (s => {
			const result: R[] = [];
			if (!s.obj)
				s.obj = {};
			s.obj.array = result;

			while (s.remaining() !== 0) {
				const value = read(s, type);
				if (value === undefined)
					break;
				if (value instanceof Promise)
					return asyncPath(value);
				result.push(value);
			}
			delete s.obj.array;
			return result;

			async function asyncPath(value: Promise<ReadType<T>>): Promise<R[]> {
				const value2 = await value;
				if (value2 !== undefined) {
					result.push(value2);
					while (s.remaining() !== 0) {
						const value = await read(s, type);
						if (value === undefined)
							break;
						result.push(value);
					}
				}
				delete s.obj.array;
				return result;
			}
		}) as get<R[]>,
		put: ((s, v) => writen(s, type, v)) as put<R[]>
	};
}
/**
 *  @deprecated, use Array instead
 */
export const ArrayType = Array;
/**
 *  @deprecated, use RemainingArray instead
 */
export const RemainingArrayType = RemainingArray;

//-----------------------------------------------------------------------------
//	buffer types
//-----------------------------------------------------------------------------

export function Buffer<V extends ViewMaker<any>>(len: TypeX<number>, view: V): TypeT<ViewInstance<V>>;
export function Buffer(len: TypeX<number>): TypeT<Uint8Array<ArrayBufferLike>>;
export function Buffer(len: TypeX<number>, view: ViewMaker<any> = Uint8Array): any {
	const x = makex(len);
	return {
		get: (s => after(x.get(s),
			n	=> s.view(view, n),
		)) as get<TypedArray>,
		put: ((s, v) => after(x.put(s, v.length),
			()	=> after(s.view(view, v.length),
			d	=> d.set(v)
		))) as put<TypedArray>
	};
}

export function RemainingBuffer<V extends ViewMaker<any>>(view: V): TypeT<ViewInstance<V>>;
export function RemainingBuffer(): TypeT<Uint8Array<ArrayBufferLike>>;
export function RemainingBuffer(view: ViewMaker<any> = Uint8Array): any {
	return {
		get:(s => {
			const tell = s.tell();
			const chunk = (nextSize: number): any => after(
				s.view(view, nextSize, false),
				d => {
					if (d.length < nextSize)
						return d;
					s.seek(tell);
					return chunk(nextSize * 2);
				}
			);
			return chunk(16);
		}) as get<TypedArray>,
		put:((s, v) => after(s.view(view, v.length),
			d => d.set(v)
		)) as put<TypedArray>
	};
}

export const Remainder = RemainingBuffer(Uint8Array);

//-----------------------------------------------------------------------------
//	positional types
//-----------------------------------------------------------------------------

export function Size<T extends Type>(len: TypeX<number>, type: T, skip0?: false): TypeT<ReadType<T>>;
export function Size<T extends Type>(len: TypeX<number>, type: T, skip0?: true): TypeT<ReadType<T> | undefined>;
export function Size<T extends Type>(len: TypeX<number>, type: T, skip0 = false) {
	const x = makex(len);
	return {
		get: (s => after(x.get(s), size => {
			if (!skip0 || size) {
				const start = s.tell();
				return after(read(s.offsetStream(start, size), type), r => {
					s.seek(start + size);
					return r;
				});
			}
		})) as get<ReadType<T> | undefined>,
		put: ((s, v) => {
			const sizePos = s.tell();
			return after(x.put(s, 0), () => {
				if (v === undefined)
					return undefined;

				const s2 = s.offsetStream(s.tell());
				return after(write(s2, type, v), () => {
					const len2 = s2.tell();
					s.seek(sizePos);
					return after(x.put(s, len2), () => s.skip(len2));
				});
			});
		}) as put<ReadType<T> | undefined>
	};
}

/**
 *  @deprecated, use Size instead
 */
export const SizeType = Size;

export function Measured<T extends Type>(type: T): TypeT<ReadType<T>> {
	return Size(measure(type as sync.Type), type);
}

export function AfterSkip<T extends Type>(skip: number, type: T): TypeT<ReadType<T>> {
	return {
		get: (s => (s.skip(skip), read(s, type))) as get<ReadType<T>>,
		put: ((s, v) => (s.skip(skip), write(s, type, v))) as put<ReadType<T>>
	};
}

export function Aligned<T extends Type>(align: number, type: T): TypeT<ReadType<T>> {
	return {
		get: (s => (s.align(align), read(s, type))) as get<ReadType<T>>,
		put: ((s, v) => (s.align(align), write(s, type, v))) as put<ReadType<T>>
	};
}

export function Offset<T extends Type>(offset: TypeX<number>, type: T, skip_null?: false): TypeT<ReadType<T>>;
export function Offset<T extends Type>(offset: TypeX<number>, type: T, skip_null: true): TypeT<ReadType<T> | undefined>;
export function Offset<T extends Type>(offset: TypeX<number>, type: T, skip_null = false) {
	const x = makex(offset);
	return {
		get: (s => after(x.get(s), off => {
			if (!skip_null || off)
				return read(s.offsetStream(off), type);
		})) as get<ReadType<T> | undefined>,

		put: ((s, v) => {
			const offsetPos = s.tell();
			return after(x.put(s, 0), () => {
				if (v === undefined)
					return undefined;

				const atend = s.atend;
				s.atend = (s: any) => {
					const start = s.tell();
					const s2 = s.offsetStream(start);
					return after(write(s2, type, v), () => {
						const size = s2.tell();
						s.seek(offsetPos);
						return after(x.put(s, start), () => {
							s.skip(size);
							atend?.(s);
						});
					});
				};
			});
		}) as put<ReadType<T> | undefined>
	};
}

/**
 *  @deprecated, use Offset instead
 */
export const OffsetType = Offset;
/**
 *  @deprecated, use Offset with skip_null=true instead
 */
export function MaybeOffset<T extends Type>(offset: TypeX<number>, type: T): TypeT<ReadType<T> | undefined> {
	return Offset(offset, type, true);
}

export function Search(pattern: Uint8Array): TypeT<number | undefined> {
	return {
		get: (s => {
			const kmp	= new utils.KMP(pattern);
			const start = s.tell();
			const chunk = (nextSize: number): any => after(
				s.view(Uint8Array, nextSize, false),
				data => {
					const index = kmp.search(data, 0);
					if (index >= 0)
						return nextSize - 16 + index;
					if (data.length < nextSize)
						return undefined;
					return chunk(nextSize * 2);
				}
			);
			const len = chunk(16);
			s.seek(start);
			return len;
		}) as get<number | undefined>,
		put: (() => {
			throw new Error("Not implemented");
		}) as put<number | undefined>,
	};
}


//-----------------------------------------------------------------------------
//	flow control types
//-----------------------------------------------------------------------------

//type SpecT<T> = TypeT<T> | {
//	[K in keyof T]: SpecT<T[K]>
//}
type SpecT2<T> = TypeT<T> | {
	[K in keyof T]: SpecT2<T[K]>
}
export function StructT<T>(spec: SpecT2<T>): TypeT<T> {
	return {
		get: (s 		=> read(s, spec) as T) as get<T>,
		put: ((s, v)	=> write(s, spec, v)) as put<T>
	};
}

function CountMatchingFields(keys: Set<string>, spec: any) {
	return Object.keys(spec).reduce((acc, key) => acc + (keys.has(key) ? 1 : 0), 0);
}

export function OptionalDiscriminator<T, F>(value: any, true_type: T, false_type: F) {
	const true_obj = typeof true_type === 'object';
	const false_obj = typeof false_type === 'object';

	if (typeof value === 'object') {
		const true_n = true_obj ? CountMatchingFields(new Set(Object.keys(value)), true_type) : 0;
		const false_n = false_obj ? CountMatchingFields(new Set(Object.keys(value)), false_type) : 0;
		return true_n > false_n ? true : false_n > true_n ? false : undefined;
	}
	return !true_obj && false_obj;
}

export function Optional<T extends Type, F extends Type | undefined = undefined>(test: TypeX<boolean | number>, type: T, false_type?: F, discriminator = (value: any) => OptionalDiscriminator(value, type, false_type)) {
	type R = F extends Type ? ReadType<T | F> : ReadType<T | undefined>;
	const x = makex(test, discriminator);
	return {
		get: (s => after(x.get(s), x => {
			if (x)
				return read(s, type) as MaybePromise<R>;
			if (false_type)
				return read(s, false_type as Type) as MaybePromise<R>;
			return undefined as R;
		})) as get<R>,
		put: ((s, v) => {
			return after(x.put(s, v),
				t => t !== undefined ? write(s, t ? type : false_type as Type, v) : undefined
			);
			//const t = discriminator(v);
			//if (t !== undefined)
			//	return after(writex(s, test, t as any), () => write(s, t ? type : false_type as Type, v));
		}) as put<R>
	};
}

export function Try<T extends Record<string, Type>>(type: T) {
	type R = Partial<ReadType<T>>;
	return {
		get: (s => {
			const obj = {obj: s.obj} as any;
			s.obj	= obj;
			let tell = s.tell();
			return tryAfter(() => {
				let acc: any = undefined;
				for (const [k, t] of Object.entries(type)) {
					acc = after(acc, () => {
						tell = s.tell();
						return after(read(s, t), value => obj[k] = value);
					});
				}
				return acc;
			},
			() => {
				s.obj = obj.obj;
				delete obj.obj;
				return obj;
			},
			() => {
				//console.log('Reverting Try type');
				s.seek(tell);
				s.obj = obj.obj;
				delete obj.obj;
				return obj;
			});
		}) as get<R>,

		put: ((s, v) => {
			s.obj = v;
			let tell = s.tell();
			return tryAfter(() => {
				let acc: any = undefined;
				for (const [k, t] of Object.entries(type)) {
					const v1 = (v as any)[k];
					if (v1 === undefined)
						break;
					acc = after(acc, () => {
						tell = s.tell();
						return write(s, t, v1);
					});
				}
				return acc;
			},
			() => {
			},
			() => {
				//console.log('Reverting Try type');
				s.seek(tell);
			});
		}) as put<R>
	} as TypeT<R>;
}
/*
export function Maybe<T>(type: TypeT2<T>): TypeT2<T | undefined> {
	return {
		get: ((s => {
			const tell = s.tell();
			return tryAfter(read2(s, type), result => result, () => {
				s.seek(tell);
				return undefined;
			});
		}) as get2<T | undefined>),
		put: ((s, v) => {
			if (v !== undefined)
				return type.put(s as any, v);
		}) as put2<T | undefined>
	};
}
*/
//function read_merge<T extends TypeReader>(s: _stream, specs: T) {
//	Object.entries(specs).forEach(([k, v]) => s.obj[k] = isReader(v) ? v.get(s) : read(s, v as TypeReader));
//}

function read_merge2<T extends Type>(s: _stream|async._stream, specs: T): MaybePromise<void> {
	if (isReader(specs))
		return after(specs.get(s as any), value => {
			Object.assign(s.obj, value);
		});

	return Object.entries(specs).reduce((acc: any, [k, v]) =>
		after(acc, () => after(read(s as any, v as any), value => {
			const current = s.obj[k];
			if (value && current && typeof value === 'object' && typeof current === 'object' && value.constructor === Object && current.constructor === Object)
				Object.assign(current, value);
			else
				s.obj[k] = value;
		}))
	, void 0);
}
/*
function read_merge2<T extends Type2>(s: _stream|async._stream, specs: T): MaybePromise<void> {
	if (isReader(specs))
		return after(specs.get(s as any), value => {
			Object.assign(s.obj, value);
		});

	return Object.entries(specs).reduce((acc: any, [k, v]) =>
		after(acc, () => after(read2(s as any, v as any), value => { s.obj[k] = value; }))
	, void 0);
}
*/
export function Discriminator<K extends string | number, T extends Record<K, any>>(value: any, switches: T): K | undefined {
	if (typeof value === 'object') {
		const keys = new Set(Object.keys(value));
		const counts = Object.values(switches).map((spec: any) => CountMatchingFields(keys, spec));
		return Object.keys(switches)[counts.reduce((best, n, i) => n > counts[best] ? i : best, 0)] as K;
	}
}

function IfDiscriminator<T, F>(value: any, true_type: T, false_type: F) {
	const result = Discriminator(value, { true: true_type, false: false_type } as any);
	return result === 'true' ? true : result === 'false' ? false : undefined;
}

export function If<T extends Type, F extends Type | undefined = undefined>(test: TypeX<boolean | number>, true_type: T, false_type?: F, discriminator = (value: any) => IfDiscriminator(value, true_type, false_type)) {
	type R = F extends Type ? ReadType<T | F> : ReadType<T | undefined>;
	const x = makex(test, discriminator);
	return {
		get: (s => after(x.get(s), x => after(
			false_type ? read_merge2(s, x ? true_type : false_type) : x ? read_merge2(s, true_type) : undefined,
			() => ({} as MergeType<R>)
		))) as get<MergeType<R>>,
		put: ((s, v) => after(x.put(s, v),
				t => false_type && t !== undefined ? write(s, t ? true_type : false_type as Type, v)
					: t && write(s, true_type, v)
			)
		) as put<MergeType<R>>
	} as TypeT<MergeType<R>>;
}


type DiscrimSwitch<KName extends string, T extends Record<string | number, any>> = {
	[J in keyof T & (string | number)]: {[K in KName]: J} & ReadType<T[J]>
}[keyof T & (string | number)];

export function Switch<KName extends string, K extends string | number, T extends Record<K, Type>>(test: KName, switches: T) : TypeT<CorrelatedMerge<DiscrimSwitch<KName, T>>>;
export function Switch<K extends string | number, T extends Record<K, Type>>(test: TypeX<K>, switches: T) : TypeT<ReadType<T[keyof T]>>;

export function Switch<KName extends string, K extends string | number, T extends Record<K, Type>>(test: TypeX<K>, switches: T, discriminator = (value: any) => Discriminator(value, switches as any) as K) {
	const lookup = (x: any) => switches[x as keyof T] ?? (switches as any).default;

	if (typeof test === 'string') {
		type R = DiscrimSwitch<KName, T>;
		return {
			get: (s => {
				const t = lookup(s.obj[test]);
				return t ? read_merge2(s, t) : ({} as CorrelatedMerge<R>);
			}) as get<CorrelatedMerge<R>>,
			put: ((s, _v) => {
				const t = lookup(s.obj[test]);
				if (t !== undefined)
					return write(s, t, s.obj);
			}) as put<CorrelatedMerge<R>>
		};

	} else {
		type R = ReadType<T[keyof T]>;
		const x = makex(test, discriminator);
		return {
			get: (s => after(x.get(s), key => {
				const t = lookup(key);
				return t && read(s, t);
			})) as get<R>,
			put: ((s, v) => {
				return after(x.put(s, v),
					key => {
						const t = lookup(key);
						return t ? write(s, t, v) : undefined;
					}
				);
				/*
				if (!isWriter(test))
					return write(s, lookup(getx(s, test)), v);
				const t = discriminator(v);
				if (t !== undefined)
					return after(writex(s, test, t as any), () => write(s, switches[t as keyof T], v));
				*/
			}) as put<R>
		};
	}
}
/*
type DiscrimUnion<T extends Record<string | number, any>> = {
	[J in keyof T & (string | number)]: [J, ReadType<T[J]>]
}[keyof T & (string | number)];

type DiscrimWrap<T extends Record<string | number, Type2>> = <K extends keyof T & (string | number)>(key: K, type: T[K]) => Type2;

export function DiscrimSpec<T extends Record<string | number, Type2>>(keySpec: TypeX2<string | number>, cases: T, wrap?: DiscrimWrap<T>): TypeT2<DiscrimUnion<T>> {
	type R = DiscrimUnion<T>;
	const getType = (k: any) => {
		const t = (cases as any)[k] ?? (cases as any).default;
		return t && (wrap ? (wrap as any)(k, t) : t);
	};
	return {
		get: (s => after(readx2(s, keySpec), k => after(
			getType(k) ? read2(s, getType(k)) : undefined,
			data => [k, data] as R
		))) as get2<R>,
		put: ((s, v) => after(writex2(s, keySpec, v[0]), () => {
			const spec = getType(v[0]);
			return spec ? write2(s, spec, v[1]) : undefined;
		})) as put2<R>
	} as TypeT2<R>;
}
*/

export interface DeferedType<T> {
	get(): MaybePromise<T>;
}

export function resolved<T>(value: Promise<T>): DeferedType<T>;
export function resolved<T>(value: T): DeferedType<T>;
export function resolved(value: any) {
	return { get: () => value };
}

export function Defered<T extends Type>(type: T): TypeT<DeferedType<ReadType<T>>> {
	return {
		get: (s => {
			const obj = s.obj;
			let cached: MaybePromise<ReadType<T>> | undefined;

			return { get: () => {
				if (!cached) {
					s.obj = obj;
					cached = read(s, type);
				}
				return cached;
			}};
			
		}) as get<DeferedType<ReadType<T>>>,
		put: ((s, v) => after(v.get(), v => write(s, type, v))) as put<DeferedType<ReadType<T>>>
	};
}

export function Merge<T extends Type>(type: T): TypeT<MergeType<ReadType<T>>> {
	type R = MergeType<ReadType<T>>;
	return {
		get: (s => after(read(s, type), value => {
			if (value && typeof value === 'object')
				Object.assign(s.obj, value);
			return {} as R;
		})) as get<R>,
		put: ((s, v) => write(s, type, v as ReadType<T>)) as put<R>
	};
}

export function Repeat<T extends Type>(len: TypeX<number>, type: T, split = (v: ReadType<T>) => [v]) {
	type R = MergeType<Partial<ReadType<T>>>;
	const x = makex(len);
	return {
		get: (s => after(x.get(s), n => {
			const obj0 = s.obj;
			const obj = {} as any;
			s.obj = obj;
			let acc: any = undefined;
			for (let i = 0; i < n; i++)
				acc = after(acc, () => read_merge2(s, type));
			return after(acc, () => {
				s.obj = obj0;
				return obj;
			});
		})) as get<R>,
		put: ((s, v) => {
			const vs = split(v as ReadType<T>);
			return after(x.put(s, vs.length), () => writen(s, type, vs));
		}) as put<R>
	};
}

export function RemainingRepeat<T extends Type>(type: T, split = (s: any, v: ReadType<T>) => [v]) {
	 type R = MergeType<Partial<ReadType<T>>>;
	 return {
		get: (s => {
		 const obj0 = s.obj;
		 const obj = {} as any;
		 s.obj = obj;
		 while (s.remaining() !== 0) {
			const r = read_merge2(s, type);
			if (r instanceof Promise)
			 return asyncPath(r);
		 }
		 s.obj = obj0;
		 return obj;

		 async function asyncPath(first?: Promise<void>) {
			if (first)
			 await first;
			while (s.remaining() !== 0)
			 await read_merge2(s, type);
			s.obj = obj0;
			return obj;
		 }
		}) as get<R>,
		put: ((s, v) => writen(s, type, split(s, v as ReadType<T>))) as put<R>
	 };
}

//-----------------------------------------------------------------------------
//	AS - read as one type, return another
//-----------------------------------------------------------------------------

interface adapter0<T, D, O=void> {
	to(x: T, opt: O): MaybePromise<D>;
	from(x: D, opt: O): MaybePromise<T>;
}
type adapter1<T, D, O=void> = (new (x: T, opt: O) => D) | ((x: T, opt: O) => D);

export type adapter<T, D, O=void> = adapter0<T, D, O> | adapter1<T, D, O>;

function isConstructor<T, D, O>(maker: adapter1<T,D,O>): maker is new (arg: T, opt: O) => D {
	return maker.prototype?.constructor.name;
}
//export 
function make<T, D, O>(maker: adapter<T,D,O>, x: T, opt?: O): MaybePromise<D> {
	return typeof maker === 'function' ? (isConstructor(maker) ? new maker(x, opt as O): maker(x, opt as O)) : maker.to(x, opt as O);
}
//export 
function unmake<T, D, O>(maker: adapter<T,D,O>, x: D, from?: (x: D)=>T, opt?: O) {
	return typeof maker === 'function' ? (from ? from(x) : x) : maker.from(x, opt as O);
}

export function as<T, D>(type: TypeT<T>, maker: adapter0<T, D, _stream|async._stream>) : TypeT<D>;
export function as<T, D>(type: TypeT<T>, maker: adapter<T, D, _stream|async._stream>, from?: (arg: D) => T) : TypeT<D>;
export function as<T extends Type, D>(type: T, maker: adapter<ReadType<T>, D, _stream|async._stream>, from?: (arg: D) => ReadType<T>) : TypeT<D>;
export function as<T extends Type, D>(type: T, maker: adapter<any, D, _stream|async._stream>, from?: (arg: D) => ReadType<T>) : TypeT<D>;
export function as<D>(type: Type, maker: adapter<any, D, _stream|async._stream>, from?: (arg: D) => any) : TypeT<D> {
	return {
		get: (s => after(read(s, type), v => make(maker, v, s))) as get<D>,
		put: ((s, v) => write(s, type, unmake(maker, v, from, s))) as put<D>
	};
}

export function BitFields<D>(bitfields: utils.BitAdapter<any, D>, be?: boolean) : TypeT<D>;
export function BitFields<T extends Record<string, utils.BitAdapterN<any, any> | number>>(bitfields: T, be?: boolean): TypeT<utils.BitsOutput<T>>;
export function BitFields(bitfields: any, be?: boolean): TypeT<any> {
	be = be ?? false;
	if (typeof bitfields.get !== 'function') {
		const total	= Object.values(bitfields).reduce((sum, bf: any) => sum + (typeof bf === 'number' ? bf : bf.bits), 0) as number;
		bitfields = utils.BitFields(total, bitfields);
	}
	return as(UINT(bitfields.bits, be), bitfields);
}
