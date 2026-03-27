import * as utils from './utils';
import * as async from './async';
import { after, tryAfter, MaybePromise, TypedArray, ViewMaker } from './utils';
import { _stream, ReadType, MergeType, CorrelatedMerge, TypeX, TypeX0, TypeT, Type, TypeReader, TypeWriter, isReader, isWriter, getx, measure } from './sync';

export type stream2 = (_stream | async._stream) & {
	read<T extends TypeReader>(spec: T) : MaybePromise<ReadType<T>>;
	write<T extends TypeWriter>(type: T, value: ReadType<T>): MaybePromise<void>;
}

//-----------------------------------------------------------------------------
// possibly async versions of read/write
//-----------------------------------------------------------------------------

export type get2<T> = ((s: _stream) => T) & ((s: async._stream) => Promise<T>);
export type put2<T> = ((s: _stream, v: T) => void) & ((s: async._stream, v: T) => Promise<void>);
export interface TypeT2<T>	{ get: get2<T>; put: put2<T>; }
export type TypeX2<T>	= TypeT2<T> | TypeT<T> | TypeX0<T>;// | async.TypeX0<T>;
export type Type2		= Type | async.Type;

export function read2<T extends TypeReader>(s: _stream, spec: T, obj?: any) : ReadType<T>;
export function read2<T extends async.TypeReader>(s: async._stream, spec: T, obj?: any) : Promise<ReadType<T>>;
export function read2<T extends TypeReader|async.TypeReader>(s: _stream|async._stream, spec: T, obj?: any) : MaybePromise<ReadType<T>>;
export function read2<T extends TypeReader|async.TypeReader>(s: any, spec: T, obj?: any) : MaybePromise<ReadType<T>> {
	if (isReader(spec))
		return spec.get(s);

	if (!obj)
		obj = {obj: s.obj} as any;
	s.obj	= obj;

    return after(Object.entries(spec).reduce((acc: any, [k, t]) => 
        after(acc, () => after(read2(s, t), value => obj[k] = value))
    , undefined), () => {
		s.obj	= obj.obj;
		delete obj.obj;
		return obj;
	});
}

export function write2(s: _stream, type: TypeWriter, value: any) : void;
export function write2(s: async._stream, type: async.TypeWriter, value: any) : Promise<void>;
export function write2(s: _stream|async._stream, type: TypeWriter|async.TypeWriter, value: any) : MaybePromise<void>;
export function write2(s: any, type: TypeWriter|async.TypeWriter, value: any) : MaybePromise<void> {
	if (isWriter(type))
		return type.put(s, value);

	s.obj = value;
    return Object.entries(type).reduce((acc: any, [k, t]) => 
        after(acc, () => write2(s, t, value[k]))
    , undefined);
}

export function readn2<T extends TypeReader>(s: _stream, type: T, n: number) : ReadType<T>[];
export function readn2<T extends async.TypeReader>(s: async._stream, type: T, n: number) : Promise<ReadType<T>[]>;
export function readn2<T extends TypeReader|async.TypeReader>(s: _stream|async._stream, type: T, n: number) : MaybePromise<ReadType<T>[]>;
export function readn2<T extends TypeReader|async.TypeReader>(s: any, type: T, n: number) : MaybePromise<ReadType<T>[]> {
	const result: ReadType<T>[] = [];
	let acc: any = undefined;
	for (let i = 0; i < n; i++)
		acc = after(acc, () => after(read2(s, type), value => result.push(value)));
	return after(acc, () => result);
}

export function writen2(s: _stream, type: TypeWriter, v: any): void;
export function writen2(s: async._stream, type: async.TypeWriter, v: any): Promise<void>;
export function writen2(s: _stream|async._stream, type: TypeWriter|async.TypeWriter, v: any): MaybePromise<void>;
export function writen2(s: any, type: any, v: any) {
    return v.reduce((acc: any, i: any) => 
        after(acc, () => write2(s, type, i))
    , undefined);
}

export function readx2<T extends object | number | string | boolean>(s: _stream, type: TypeX<T>): T;
export function readx2<T extends object | number | string | boolean>(s: async._stream, type: async.TypeX<T>): Promise<T>;
export function readx2<T extends object | number | string | boolean>(s: _stream | async._stream, type: TypeX2<T>): MaybePromise<T>;
export function readx2<T extends object | number | string | boolean>(s: any, type: TypeX2<T>) {
	return 	isReader(type)				? type.get(s)
		:	getx(s, type);
}
export function writex2<T extends object | number | string>(s: _stream, type: TypeX<T>, value: T) : T;
export function writex2<T extends object | number | string>(s: async._stream, type: async.TypeX<T>, value: T): Promise<T>;
export function writex2<T extends object | number | string>(s: _stream | async._stream, type: TypeX2<T>, value: T): MaybePromise<T>;
export function writex2<T extends object | number | string>(s: any, type: TypeX2<T>, value: T) {
	return	isWriter(type)				? after(type.put(s, value), () => value)
		:	typeof type === 'function'	? type(s, value)
		:	getx(s, type);
}

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

export function Func<T>(func: (s: _stream|async._stream, v?: T)=>MaybePromise<T>): TypeT2<T> {
	return {
		get: (s => func(s)) as get2<T>,
		put: ((s, v) => func(s, v)) as put2<T>
	};
}

export function FuncType<T extends Type2>(func: (s: _stream|async._stream, v?: T)=>MaybePromise<T>): TypeT2<ReadType<T>> {
	return {
		get: (s => after(func(s), t=> read2(s, t))) as get2<ReadType<T>>,
		put: ((s, v) => after(func(s), t => write2(s, t, v))) as put2<ReadType<T>>
	};
}
export function Discard(type: Type2): TypeT2<undefined> {
	return {
		get: (s => after(read2(s, type), () => undefined)) as get2<undefined>,
		put: ((_s, _v) => undefined) as put2<undefined>
	};
}

export function Expect<T extends Type2>(type: T, t: ReadType<T>): TypeT2<undefined> {
	return {
		get: (s => after(read2(s, type), x => {
			if (x !== t)
				throw new Error(`Expected ${t}, got ${x}`);
			return undefined;
		})) as get2<undefined>,
		put: (s => write2(s, type, t)) as put2<undefined>
	};
}
export function Struct<T extends Type2>(spec: T): TypeT2<ReadType<T>> {
	return {
		get:(s => read2(s, spec)) as get2<ReadType<T>>,
		put:((s, v) => write2(s, spec, v)) as put2<ReadType<T>>
	};
}

//-----------------------------------------------------------------------------
//	numeric types
//-----------------------------------------------------------------------------

//type TypeNumber<T extends number> = T extends 8 | 16 | 24 | 32 | 40 | 48 | 56
//	? TypeT<number>
//	: TypeT<bigint>;

//type TypeNumber2<T extends number> = TypeT2<utils.NumericType<T>>;

type TypeNumber2<N extends number> = N extends 8 | 16 | 24 | 32 | 40 | 48 | 56
	? TypeT2<number>
	: TypeT2<bigint>;

function endian_from_stream<T extends number | bigint>(type: (be?: boolean)=>TypeT2<T>): TypeT2<T> {
	return {
		get: ((s => type(s.be).get(s as any)) as get2<T>),
		put: ((s, v) => type(s.be).put(s as any, v)) as put2<T>,
	};
}

function endian<T extends number | bigint>(type: (be?: boolean)=>TypeT2<T>, be?: boolean) {
	return be === undefined ? endian_from_stream(type) : type(be);
}


//8 bit
export const UINT8: TypeT2<number> = {
	get: ((s => after(s.view(DataView, 1), dv => dv.getUint8(0))) as get2<number>),
	put: ((s, v) => after(s.view(DataView, 1), dv => dv.setUint8(0, v))) as put2<number>,
};
export const INT8: TypeT2<number> = {
	get: ((s => after(s.view(DataView, 1), dv => dv.getInt8(0))) as get2<number>),
	put: ((s, v) => after(s.view(DataView, 1), dv => dv.setInt8(0, v))) as put2<number>,
};

//16 bit
function _UINT16(be?: boolean): TypeT2<number> { return {
	get: ((s => after(s.view(DataView, 2), dv => dv.getUint16(0, !be))) as get2<number>),
	put: ((s, v) => after(s.view(DataView, 2), dv => dv.setUint16(0, v, !be))) as put2<number>,
};};
function _INT16(be?: boolean): TypeT2<number> { return {
	get: ((s => after(s.view(DataView, 2), dv => dv.getInt16(0, !be))) as get2<number>),
	put: ((s, v) => after(s.view(DataView, 2), dv => dv.setInt16(0, v, !be))) as put2<number>,
};};
export const UINT16_LE	= _UINT16(false), UINT16_BE = _UINT16(true), INT16_LE = _INT16(false), INT16_BE = _INT16(true);
export const UINT16		= endian_from_stream(_UINT16), INT16 = endian_from_stream(_INT16);

//32 bit
function _UINT32(be?: boolean): TypeT2<number> { return {
	get: ((s => after(s.view(DataView, 4), dv => dv.getUint32(0, !be))) as get2<number>),
	put: ((s, v) => after(s.view(DataView, 4), dv => dv.setUint32(0, v, !be))) as put2<number>,
};};
function _INT32(be?: boolean): TypeT2<number> { return {
	get: ((s => after(s.view(DataView, 4), dv => dv.getInt32(0, !be))) as get2<number>),
	put: ((s, v) => after(s.view(DataView, 4), dv => dv.setInt32(0, v, !be))) as put2<number>,
};};
export const UINT32_LE	= _UINT32(false), UINT32_BE = _UINT32(true), INT32_LE = _INT32(false), INT32_BE = _INT32(true);
export const UINT32 	= endian_from_stream(_UINT32), INT32 = endian_from_stream(_INT32);

//64 bit 
function _UINT64(be?: boolean): TypeT2<bigint> { return {
	get: ((s => after(s.view(DataView, 8), dv => utils.getBigUint(dv, 0, 8, !be))) as get2<bigint>),
	put: ((s, v) => after(s.view(DataView, 8), dv => utils.putBigUint(dv, 0, v, 8, !be))) as put2<bigint>,
};};
function _INT64(be?: boolean): TypeT2<bigint> { return {
	get: ((s => after(s.view(DataView, 8), dv => utils.toSignedBig(utils.getBigUint(dv, 0, 8, !be), 64))) as get2<bigint>),
	put: ((s, v) => after(s.view(DataView, 8), dv => utils.putBigUint(dv, 0, v, 8, !be))) as put2<bigint>,
};};
export const UINT64_LE	= _UINT64(false), UINT64_BE = _UINT64(true), INT64_LE = _INT64(false), INT64_BE = _INT64(true);
export const UINT64		= endian_from_stream(_UINT64), INT64 = endian_from_stream(_INT64);

//computed int
export function UINT<N extends number>(bits: N, be?: boolean): TypeNumber2<N> {
	if (bits & 7)
		throw new Error('bits must be multiple of 8');

	return (bits === 8 ? UINT8
		: bits > 56
		? endian((be?: boolean) => ({
			get: ((s => after(s.view(DataView, bits / 8), dv => utils.getBigUint(dv, 0, bits / 8, !be))) as get2<bigint>),
			put: ((s, v) => after(s.view(DataView, bits / 8), dv => utils.putBigUint(dv, 0, v, bits / 8, !be))) as put2<bigint>
		}), be)
		: endian(bits == 16 ? _UINT16 : bits == 32 ? _UINT32 :
		(be?: boolean) => ({
			get: ((s => after(s.view(DataView, bits / 8), dv => utils.getUint(dv, 0, bits / 8, !be))) as get2<number>),
			put: ((s, v) => after(s.view(DataView, bits / 8), dv => utils.putUint(dv, 0, v, bits / 8, !be))) as put2<number>
		}), be)
	 ) as TypeNumber2<N>;
}

export function INT<N extends number>(bits: N, be?: boolean): TypeNumber2<N> {
	if (bits & 7)
		throw new Error('bits must be multiple of 8');

	return (bits === 8 ? UINT8
		: bits > 56
		? endian((be?: boolean) => ({
			get: ((s => after(s.view(DataView, bits / 8), dv => utils.toSignedBig(utils.getBigUint(dv, 0, bits / 8, !be), bits))) as get2<bigint>),
			put: ((s, v) => after(s.view(DataView, bits / 8), dv => utils.putBigUint(dv, 0, v, bits / 8, !be))) as put2<bigint>
		}), be)
		: endian(bits == 16 ? _INT16 : bits == 32 ? _INT32 :
		(be?: boolean) => ({
			get: ((s => after(s.view(DataView, bits / 8), dv => utils.toSigned(utils.getUint(dv, 0, bits / 8, !be), bits))) as get2<number>),
			put: ((s, v) => after(s.view(DataView, bits / 8), dv => utils.putUint(dv, 0, v, bits / 8, !be))) as put2<number>
		}), be)
	) as TypeNumber2<N>;
}

//float
function _Float32(be?: boolean): TypeT2<number> { return {
	get: ((s => after(s.view(DataView, 4), dv => dv.getFloat32(0, !be))) as get2<number>),
	put: ((s, v) => after(s.view(DataView, 4), dv => dv.setFloat32(0, v, !be))) as put2<number>
};};
function _Float64(be?: boolean): TypeT2<number> { return {
	get: ((s => after(s.view(DataView, 8), dv => dv.getFloat64(0, !be))) as get2<number>),
	put: ((s, v) => after(s.view(DataView, 8), dv => dv.setFloat64(0, v, !be))) as put2<number>
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
export const ULEB128: TypeT2<number|bigint> = {
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
	})) as get2<number|bigint>,

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
	}) as put2<number|bigint>,
};

//-----------------------------------------------------------------------------
//	string types
//-----------------------------------------------------------------------------

export function String(len: TypeX2<number>, encoding: utils.TextEncoding = 'utf8', zeroTerminated = false, lenScale?: number): TypeT2<string> {
	const rawScale = encoding == 'utf8' ? 1 : 2;
	const lenScale2 = lenScale ?? rawScale;
	return {
		get: ((s => after(readx2(s, len),
			len2 => after(s.view(Uint8Array, len2 * lenScale2),
			buff => {
				const v = utils.decodeText(buff, encoding);
				const z = zeroTerminated ? v.indexOf('\0') : -1;
				return z >= 0 ? v.substring(0, z) : v;
			})
		)) as get2<string>),
		put: ((s, v) => {
			if (zeroTerminated)
				v += '\0';
			return after(writex2(s, len, v.length * rawScale / lenScale2),
				len2 => after(s.view(Uint8Array, len2 * lenScale2),
				buff => buff.set(utils.encodeText(v, encoding))
			));
		}) as put2<string>,
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

export function NullTerminatedString(encoding: utils.TextEncoding = 'utf8'): TypeT2<string> {
	return String(
		(s, v?: number) => v === undefined ? find0(s, encoding === 'utf8' ? Uint8Array : Uint16Array) : v,
		encoding, true, 1
	);
};

export function RemainingString(encoding: utils.TextEncoding = 'utf8', zeroTerminated = false): TypeT2<string> {
	return {
		get: (s => after(s.remainder(), r => utils.decodeText(r, encoding))) as get2<string>,
		put: ((s, v) => {
			if (zeroTerminated)
				v += '\0';
			const encoded = utils.encodeText(v, encoding);
			return after(s.view(Uint8Array, encoded.length), buffer => buffer.set(encoded));
		}) as put2<string>,
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

export function Array<T extends Type2>(len: TypeX2<number>, type: T): TypeT2<ReadType<T>[]> {
	type R = ReadType<T>[];
	return {
		get: ((s => after(readx2(s, len), n => readn2(s, type, n))) as get2<R>) as get2<R>,
		put: ((s, v) => after(writex2(s, len, v.length), () => writen2(s, type, v))) as put2<R>
	};
}

export function RemainingArray<T extends Type2>(type: T): TypeT2<ReadType<T>[]> {
	type R = ReadType<T>[];
	return {
		get: (s => {
			const result: R = [];

			while (s.remaining() !== 0) {
				const value = read2(s, type);
				if (value === undefined)
					break;
				if (value instanceof Promise)
					return asyncPath(value);
				result.push(value);
			}
			return result;

			async function asyncPath(value: Promise<ReadType<T>>): Promise<R> {
				const value2 = await value;
				if (value2 !== undefined) {
					result.push(value2);
					while (s.remaining() !== 0) {
						const value = await read2(s, type);
						if (value === undefined)
							break;
						result.push(value);
					}
				}
				return result;
			}
		}) as get2<R>,
		put: ((s, v) => writen2(s, type, v)) as put2<R>
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

export function Buffer<T extends TypedArray = Uint8Array>(len: TypeX2<number>, view: ViewMaker<T> = Uint8Array as any): TypeT2<T> {
	return {
		get: (s => after(readx2(s, len),
			n	=> s.view(view, n),
		)) as get2<T>,
		put: ((s, v) => after(writex2(s, len, v.length),
			()	=> after(s.view(view, v.length),
			d	=> d.set(v)
		))) as put2<T>
	};
}

export function RemainingBuffer<T extends TypedArray = Uint8Array>(view: ViewMaker<T> = Uint8Array as any): TypeT2<T> {
	return {
		get:(s => {
			const tell = s.tell();
			const chunk = (nextSize: number): any => after(
				s.view(view, nextSize, false),
				data => {
					if (data.length < nextSize)
						return data;
					s.seek(tell);
					return chunk(nextSize * 2);
				}
			);
			return chunk(16);
		}) as get2<T>,
		put:((s, v) => after(s.view(view, v.length), d => d.set(v))) as put2<T>
	};
}

export const Remainder = RemainingBuffer(Uint8Array);

//-----------------------------------------------------------------------------
//	positional types
//-----------------------------------------------------------------------------

export function Size<T extends Type2>(len: TypeX2<number>, type: T): TypeT2<ReadType<T>> {
	return {
		get: (s => after(readx2(s, len), size => {
			const start = s.tell();
			return after(read2(s.offsetStream(start, size), type), r => {
				s.seek(start + size);
				return r;
			});
		})) as get2<ReadType<T>>,
		put: ((s, v) => {
			const offsetPos = s.tell();
			return after(writex2(s, len, 0), () => {
				const start = s.tell();
				return after(write2(s.offsetStream(start), type, v), () => {
					const end = s.tell();
					s.seek(offsetPos);
					return after(writex2(s, len, end - start), () => s.seek(end));
				});
			});
		}) as put2<ReadType<T>>
	};
}

/**
 *  @deprecated, use Size instead
 */
export const SizeType = Size;

export function Measured<T extends Type2>(type: T): TypeT2<ReadType<T>> {
	return Size(measure(type as Type), type);
}

export function AfterSkip<T extends Type2>(skip: number, type: T): TypeT2<ReadType<T>> {
	return {
		get: (s => (s.skip(skip), read2(s, type))) as get2<ReadType<T>>,
		put: ((s, v) => (s.skip(skip), write2(s, type, v))) as put2<ReadType<T>>
	};
}

export function Aligned<T extends Type2>(align: number, type: T): TypeT2<ReadType<T>> {
	return {
		get: (s => (s.align(align), read2(s, type))) as get2<ReadType<T>>,
		put: ((s, v) => (s.align(align), write2(s, type, v))) as put2<ReadType<T>>
	};
}

export function Offset<T extends Type2>(offset: TypeX2<number>, type: T, skip_null?: false): TypeT2<ReadType<T>>;
export function Offset<T extends Type2>(offset: TypeX2<number>, type: T, skip_null: true): TypeT2<ReadType<T> | undefined>;
export function Offset<T extends Type2>(offset: TypeX2<number>, type: T, skip_null = false) {
	return {
		get: (s => after(readx2(s, offset), off => {
			if (!skip_null || off)
				return read2(s.offsetStream(off), type);
		})) as get2<ReadType<T> | undefined>,

		put: ((s, v) => {
			if (v === undefined)
				return undefined;
			const offsetPos = s.tell();
			return after(writex2(s, offset, 0), () => {
				const atend = s.atend;
				s.atend = (s: any) => {
					const start = s.tell();
					const s2 = s.offsetStream(start);
					return after(write2(s2, type, v), () => {
						const size = s2.tell();
						s.seek(offsetPos);
						return after(writex2(s, offset, start), () => {
							s.skip(size);
							atend?.(s);
						});
					});
				};
			});
		}) as put2<ReadType<T> | undefined>
	};
}

/**
 *  @deprecated, use Offset instead
 */
export const OffsetType = Offset;
/**
 *  @deprecated, use Offset with skip_null=trueinstead
 */
export function MaybeOffset<T extends Type2>(offset: TypeX2<number>, type: T): TypeT2<ReadType<T> | undefined> {
	return Offset(offset, type, true);
}

//-----------------------------------------------------------------------------
//	flow control types
//-----------------------------------------------------------------------------

//type SpecT<T> = TypeT<T> | {
//	[K in keyof T]: SpecT<T[K]>
//}
type SpecT2<T> = TypeT2<T> | {
	[K in keyof T]: SpecT2<T[K]>
}
export function StructT<T>(spec: SpecT2<T>): TypeT2<T> {
	return {
		get: (s 		=> read2(s, spec) as T) as get2<T>,
		put: ((s, v)	=> write2(s, spec, v)) as put2<T>
	};
}

function CountMatchingFields(keys: Set<string>, spec: any) {
	return Object.keys(spec).reduce((acc, key) => acc + (keys.has(key) ? 1 : 0), 0);
}

export function DiscriminatorBoolean<T, F>(value: any, true_type: T, false_type: F) {
	const true_obj = typeof true_type === 'object';
	const false_obj = typeof false_type === 'object';

	if (typeof value === 'object') {
		const true_n = true_obj ? CountMatchingFields(new Set(Object.keys(value)), true_type) : 0;
		const false_n = false_obj ? CountMatchingFields(new Set(Object.keys(value)), false_type) : 0;
		return true_n > false_n ? true : false_n > true_n ? false : undefined;
	}
	return !true_obj && false_obj;
}

export function Optional<T extends Type2, F extends Type2 | undefined = undefined>(test: TypeX2<boolean | number>, type: T, false_type?: F, discriminator = (value: any) => DiscriminatorBoolean(value, type, false_type)) {
	type R = F extends Type2 ? ReadType<T | F> : ReadType<T | undefined>;
	return {
		get: (s => after(readx2(s, test), x => {
			if (x)
				return read2(s, type) as MaybePromise<R>;
			if (false_type)
				return read2(s, false_type as Type2) as MaybePromise<R>;
			return undefined as R;
		})) as get2<R>,
		put: ((s, v) => {
			if (!isWriter(test))
				return write2(s, getx(s, test) ? type : false_type as Type2, v);
			const t = discriminator(v);
			if (t !== undefined)
				return after(writex2(s, test, t as any), () => write2(s, t ? type : false_type as Type2, v));
		}) as put2<R>
	};
}

export function Try<T extends Record<string, Type2>>(type: T) {
	type R = Partial<ReadType<T>>;
	return {
		get: (s => {
			const obj = {obj: s.obj} as any;
			s.obj	= obj;
			let tell = s.tell();
			tryAfter(() => {
				let acc: any = undefined;
				for (const [k, t] of Object.entries(type)) {
					acc = after(acc, () => {
						tell = s.tell();
						return after(read2(s, t), value => obj[k] = value);
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
				console.log('Reverting Try type');
				s.seek(tell);
				s.obj = obj.obj;
				delete obj.obj;
				return obj;
			});
		}) as get2<R>,

		put: ((s, v) => {
			s.obj = v;
			let tell = s.tell();
			tryAfter(() => {
				let acc: any = undefined;
				for (const [k, t] of Object.entries(type)) {
					const v1 = (v as any)[k];
					if (v1 === undefined)
						break;
					acc = after(acc, () => {
						tell = s.tell();
						return write2(s, t, v1);
					});
				}
				return acc;
			},
			() => {
			},
			() => {
				console.log('Reverting Try type');
				s.seek(tell);
			});
		}) as put2<R>
	} as TypeT2<R>;
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

function read_merge2<T extends Type2>(s: _stream|async._stream, specs: T): MaybePromise<void> {
	if (isReader(specs))
		return after(specs.get(s as any), value => {
			Object.assign(s.obj, value);
		});

	return Object.entries(specs).reduce((acc: any, [k, v]) =>
		after(acc, () => after(read2(s as any, v as any), value => {
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
export function If<T extends Type2, F extends Type2 | undefined = undefined>(test: TypeX2<boolean | number>, true_type: T, false_type?: F, discriminator = (value: any) => Discriminator(value, { true: true_type, false: false_type } as any)) {
	type R = F extends Type2 ? ReadType<T | F> : ReadType<T | undefined>;
	return {
		get: (s => after(readx2(s, test), x => after(
			false_type ? read_merge2(s, x ? true_type : false_type) : x ? read_merge2(s, true_type) : undefined,
			() => ({} as MergeType<R>)
		))) as get2<MergeType<R>>,
		put: ((s, v) => {
			if (!isWriter(test))
				return write2(s, getx(s, test) ? true_type : false_type as Type2, v);
			const t = discriminator(v);
			if (t !== undefined)
				return after(writex2(s, test, t as any), () => write2(s, t ? true_type : false_type as Type2, v));
		}) as put2<MergeType<R>>
	};
}

export function Discriminator<T extends Record<string | number, any>>(value: any, switches: T) {
	if (typeof value === 'object') {
		const keys = new Set(Object.keys(value));
		const counts = Object.values(switches).map((spec: any) => CountMatchingFields(keys, spec));
		return Object.keys(switches)[counts.reduce((best, n, i) => n > counts[best] ? i : best, 0)];
	}
}

type DiscrimSwitch<KName extends string, T extends Record<string | number, any>> = {
	[J in keyof T & (string | number)]: {[K in KName]: J} & ReadType<T[J]>
}[keyof T & (string | number)];

export function Switch<KName extends string, K extends string | number, T extends Record<K, Type2>>(test: KName, switches: T) : TypeT2<CorrelatedMerge<DiscrimSwitch<KName, T>>>;
export function Switch<K extends string | number, T extends Record<K, Type2>>(test: TypeX2<K>, switches: T) : TypeT2<ReadType<T[keyof T]>>;

export function Switch<KName extends string, K extends string | number, T extends Record<K, Type2>>(test: TypeX2<K>, switches: T, discriminator = (value: any) => Discriminator(value, switches as any)) {
	const lookup = (x: any) => switches[x as keyof T] ?? (switches as any).default;

	if (typeof test === 'string') {
		type R = DiscrimSwitch<KName, T>;
		return {
			get: (s => {
				const t = lookup(s.obj[test]);
				return t ? read_merge2(s, t) : ({} as CorrelatedMerge<R>);
			}) as get2<CorrelatedMerge<R>>,
			put: ((s, _v) => {
				const t = lookup(s.obj[test]);
				if (t !== undefined)
					return write2(s, t, s.obj);
			}) as put2<CorrelatedMerge<R>>
		};

	} else {
		type R = ReadType<T[keyof T]>;
		return {
			get: (s => after(readx2(s, test), key => {
				const t = lookup(key);
				return t && read2(s, t);
			})) as get2<R>,
			put: ((s, v) => {
				if (!isWriter(test))
					return write2(s, lookup(getx(s, test)), v);
				const t = discriminator(v);
				if (t !== undefined)
					return after(writex2(s, test, t as any), () => write2(s, switches[t as keyof T], v));
			}) as put2<R>
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

export function resolved<T>(value: T): DeferedType<T> {
	return { get: () => value };
}

export function Defered<T extends Type2>(type: T): TypeT2<DeferedType<ReadType<T>>> {
	return {
		get: (s => {
			const obj = s.obj;
			let cached: MaybePromise<ReadType<T>> | undefined;

			return { get: () => {
				if (!cached) {
					s.obj = obj;
					cached = read2(s, type);
				}
				return cached;
			}};
			
		}) as get2<DeferedType<ReadType<T>>>,
		put: ((s, v) => after(v.get(), v => write2(s, type, v))) as put2<DeferedType<ReadType<T>>>
	};
}

export function Merge<T extends Type2>(type: T): TypeT2<MergeType<ReadType<T>>> {
	type R = MergeType<ReadType<T>>;
	return {
		get: (s => after(read2(s, type), value => {
			if (value && typeof value === 'object')
				Object.assign(s.obj, value);
			return {} as R;
		})) as get2<R>,
		put: ((s, v) => write2(s, type, v as ReadType<T>)) as put2<R>
	};
}

export function Repeat<T extends Type2>(len: TypeX2<number>, type: T, split = (v: ReadType<T>) => [v]) {
	type R = MergeType<Partial<ReadType<T>>>;
	return {
		get: (s => after(readx2(s, len), n => {
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
		})) as get2<R>,
		put: ((s, v) => {
			const vs = split(v as ReadType<T>);
			return after(writex2(s, len, vs.length), () => writen2(s, type, vs));
		}) as put2<R>
	};
}

export function RemainingRepeat<T extends Type2>(type: T, split = (v: ReadType<T>) => [v]) {
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
		}) as get2<R>,
		put: ((s, v) => writen2(s, type, split(v as ReadType<T>))) as put2<R>
	 };
}

//-----------------------------------------------------------------------------
//	AS - read as one type, return another
//-----------------------------------------------------------------------------

interface adapter0<T, D, O=void> {
	to(x: T, opt: O): D;
	from(x: D, opt: O): T;
}
type adapter1<T, D, O=void> = (new (x: T, opt: O) => D) | ((x: T, opt: O) => D);

export type adapter<T, D, O=void> = adapter0<T, D, O> | adapter1<T, D, O>;

function isConstructor<T, D, O>(maker: adapter1<T,D,O>): maker is new (arg: T, opt: O) => D {
	return maker.prototype?.constructor.name;
}
//export 
function make<T, D, O>(maker: adapter<T,D,O>, x: T, opt?: O): D {
	return typeof maker === 'function' ? (isConstructor(maker) ? new maker(x, opt as O): maker(x, opt as O)) : maker.to(x, opt as O);
}
//export 
function unmake<T, D, O>(maker: adapter<T,D,O>, x: D, from?: (x: D)=>T, opt?: O) {
	return typeof maker === 'function' ? (from ? from(x) : x) : maker.from(x, opt as O);
}

export function as<T, D>(type: TypeT2<T>, maker: adapter0<T, D, _stream|async._stream>) : TypeT2<D>;
export function as<T, D>(type: TypeT2<T>, maker: adapter<T, D, _stream|async._stream>, from?: (arg: D) => T) : TypeT2<D>;
export function as<T extends Type2, D>(type: T, maker: adapter<ReadType<T>, D, _stream|async._stream>, from?: (arg: D) => ReadType<T>) : TypeT2<D>;
export function as<T extends Type2, D>(type: T, maker: adapter<any, D, _stream|async._stream>, from?: (arg: D) => ReadType<T>) : TypeT2<D>;
export function as<D>(type: Type2, maker: adapter<any, D, _stream|async._stream>, from?: (arg: D) => any) : TypeT2<D> {
	return {
		get: (s => after(read2(s, type), v => make(maker, v, s))) as get2<D>,
		put: ((s, v) => write2(s, type, unmake(maker, v, from, s))) as put2<D>
	};
}
