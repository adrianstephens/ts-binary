import * as utils from './utils';
export * as utils from './utils';
import * as async from './async';

export interface ViewLike { readonly byteLength: number }
export type View<T extends ViewLike> = (new(a: ArrayBufferLike, offset: number, length: number)=>T) & {BYTES_PER_ELEMENT?: number};

export function maybePromise<V, R>(v: V, then: (value: Awaited<V>) => R): V extends PromiseLike<any> ? Promise<R> : R {
	return (v instanceof Promise ? v.then(then as (value: any) => R) : then(v as Awaited<V>)) as V extends PromiseLike<any> ? Promise<R> : R;
}

type MaybePromise<T> = T | Promise<T>;
type NoPromise<T> = T extends PromiseLike<infer R> ? R : T;

//-----------------------------------------------------------------------------
//	stream
//-----------------------------------------------------------------------------

export interface _stream {
	be?: boolean;							// read numbers as bigendian/littleendian
	obj?: any;								// current object being read
	remaining(): number;					// number of remaining bytes
	remainder(): Uint8Array;						// buffer of remaining bytes
	tell(): number;							// current offset from start of file
	seek(offset: number): void;				// set current offset from start of file
	skip(offset: number): void;				// move current offset from start of file
	read_buffer(len: number): any;			// return buffer containing next len bytes, and move current offset
	write_buffer(value: Uint8Array): void;	// write buffer contents at current offset, and move current offset
	view<T extends ViewLike>(type: View<T>, len: number): T;
}


export class stream implements _stream {
	protected buffer: ArrayBufferLike;
	public offset0:	number;
	public offset:	number;
	public end:		number;

	constructor(data: Uint8Array) {
		this.buffer = data.buffer;
		this.offset = this.offset0 = data.byteOffset;
		this.end	= data.byteOffset + data.byteLength;
	}
	public remaining() {
		return this.end - this.offset;
	}
	public remainder() {
		return new Uint8Array(this.buffer, this.offset);
	}
	public tell() {
		return this.offset - this.offset0;
	}
	public seek(offset: number) {
		this.offset = this.offset0 + offset;
		return this;
	}
	public skip(offset: number) {
		this.offset += offset;
		return this;
	}
	public buffer_at(offset: number, len?: number) {
		return new Uint8Array(this.buffer, this.offset0 + offset, len ?? this.end - (this.offset0 + offset));
	}
	public read_buffer(len: number) {
		const offset = this.offset;
		this.offset = Math.min(this.end, offset + len);
		return new Uint8Array(this.buffer, offset, this.offset - offset);
	}
	public write_buffer(v: Uint8Array) {
		const d = this.view(Uint8Array, v.length);
		d.set(v);
	}
	public view<T extends ViewLike>(type: View<T>, len: number): T {
		const byteLength = len * (type.BYTES_PER_ELEMENT ?? 1);
		if (this.offset + byteLength > this.end)
			throw new Error('stream: out of bounds');
		const _t = new type(this.buffer, this.offset, len);
		this.offset += _t.byteLength;
		return _t;
	}
}

export class growingStream extends stream {
	constructor(data?: Uint8Array) {
		super(data ?? new Uint8Array(1024));
	}
	public checksize(len: number) {
		if (this.offset + len > this.buffer.byteLength) {
			const newBuffer = new ArrayBuffer(this.buffer.byteLength * 2);
			new Uint8Array(newBuffer).set(new Uint8Array(this.buffer));
			this.buffer	= newBuffer;
			this.end	= this.buffer.byteLength;
			this.offset	-= this.offset0;
			this.offset0 = 0;
		}
	}
	public view<T extends ViewLike>(type: View<T>, len: number): T {
		this.checksize(len * (type.BYTES_PER_ELEMENT ?? 1));
		return super.view(type, len);
	}
	public buffer_at(offset: number, len: number) {
		this.checksize(offset + len - this.offset);
		return super.buffer_at(offset, len);
	}
	public read_buffer(len: number) {
		this.checksize(len);
		return super.read_buffer(len);
	}
	public write_buffer(v: Uint8Array) {
		this.checksize(v.length);
		super.write_buffer(v);
	}

	terminate() {
		return new Uint8Array(this.buffer, this.offset0, this.offset - this.offset0);
	}
}

export class endianStream extends stream {
	constructor(data: Uint8Array, public be: boolean) {
		super(data);
	}
}

function clone<T extends object>(obj: T) : T {
	return Object.assign(Object.create(Object.getPrototypeOf(obj)), obj);
}

export function offsetStream(s: _stream, offset: number, size?: number) {
	const s2	= clone(s) as stream;
	s2.offset	= s2.offset0 += offset;
	if (size)
		s2.end	= s2.offset + size;
	return s2;
}

function alignStream(s: _stream, align: number) {
	const offset = s.tell() % align;
	if (offset)
		s.skip(align - offset);
}

export class dummy implements _stream {
	public offset = 0;
	public remaining() 				{ return 0; }
	public remainder() 				{ return new Uint8Array(0); }
	public tell() 					{ return this.offset; }
	public seek(offset: number) 	{ this.offset = offset; }
	public skip(offset: number) 	{ this.offset += offset; }

	public view<T extends ViewLike>(type: View<T>, len: number): T {
		const dv = new type(global.Buffer.alloc(len).buffer, 0, len);
		this.offset += len;
		return dv;
	}
	public read_buffer(len: number) {
		const offset = this.offset;
		this.offset += len;
		return offset;
	}
	public write_buffer(_v: Uint8Array)		{}
}

//-----------------------------------------------------------------------------
//	Types
//-----------------------------------------------------------------------------

export interface TypeReaderT<T> { get(s: _stream): T }
export interface TypeWriterT<T> { put(s: _stream, v: T): void }
export type TypeT<T>	= TypeReaderT<T> & TypeWriterT<T>;
export type TypeX0<T>	= ((s: _stream)=>T) | T
export type TypeX<T>	= TypeT<T> | TypeX0<T>;

export type TypeReader	= TypeReaderT<any> | { [key: string]: TypeReader; } | TypeReaderT<any>[]
export type TypeWriter	= TypeWriterT<any> | { [key: string]: TypeWriter; } | TypeWriterT<any>[]
export type Type 		= TypeT<any> | { [key: string]: Type; } | TypeT<any>[]

export interface MergeType<T> { merge: T; }

type UnionToIntersection<U> = (U extends any ? (x: U) => void : never) extends (x: infer I) => void ? I : never;

type TupleReadType<T extends readonly unknown[]> = T extends readonly [infer First, ...infer Rest]
	? [ReadType<First>, ...TupleReadType<Rest>]
	: [];


export type ReadType<T> = T extends {new (s: infer _S extends _stream): infer R} ? R
	: T extends { get: (s: any) => infer R } ? NoPromise<R>
	: T extends readonly unknown[] ? TupleReadType<T>
	: T extends { [key: string]: any } ? (
		{ [K in keyof T as T[K] extends { new (...args: any): any } ? K : T[K] extends { get: (...args: any) => infer R } ? (NoPromise<R> extends MergeType<any> ? never : NoPromise<R> extends undefined ? never : K) : K]: ReadType<T[K]> }
		& UnionToIntersection<Exclude<{
			[K in keyof T]: T[K] extends { new (...args: any): any } ? never : T[K] extends { get: (...args: any) => infer R } ? (NoPromise<R> extends MergeType<infer U> ? U : never) : never
		}[keyof T], never>>
	)
	: never;

export function ReadClass<T extends TypeReader>(spec: T) {
	return class {
		static get(s: _stream) {
			return new this(s);
		}
		constructor(s: _stream) {
			return Object.assign(this, read(s, spec));
		}
	} as (new(s: _stream) => ReadType<T>) & {
		get:<X extends abstract new (...args: any) => any>(this: X, s: _stream) => InstanceType<X>,
	};
}

export function Class<T extends Type>(spec: T) {
	return class Class {
		static get(s: _stream) {
			return new this(s);
		}
		static put(s: _stream, v: Class) {
			write(s, spec, v);
		}
		constructor(s: _stream | ReadType<T>) {
			if ('tell' in s)
				return Object.assign(this, read(s, spec));
			return Object.assign(this, s);
		}
		write(s: _stream) 	{
			write(s, spec, this);
		}
	} as (new(s: _stream | ReadType<T>) => ReadType<T> & { write(w: _stream): void }) & {
		get:<X extends abstract new (...args: any[]) => any>(this: X, s: _stream) => InstanceType<X>,
		put:(s: _stream, v: any) => void
	};
}

export function Extend<B extends abstract new (...args: any[]) => any, T extends Type>(base: B, spec: T) {
	abstract class X extends base {
		//static get(s: _stream) {
		//	return new this(s);
		//}
		static put(s: _stream, v: X) {
			write(s, spec, v);//TBD
		}
		constructor(...args: any[]) {
			const s: _stream = args[0];
			const obj = s.obj;
			super(...args);
			this.obj = obj;
			read(args[0], spec, this);
			delete this.obj;
		}
	};
	return X as unknown as (new(s: _stream) => InstanceType<B> & ReadType<T>) & {
		get:<X extends abstract new (...args: any) => any>(this: X, s: _stream) => InstanceType<X>,
		put:(s: _stream, v: any) => void
	};
}

//-----------------------------------------------------------------------------
// synchronous versions of read/write
//-----------------------------------------------------------------------------

function isReader(type: any): type is TypeReaderT<any> {
	return typeof type.get === 'function';
}
function isWriter(type: any): type is TypeWriterT<any> {
	return typeof type.put === 'function';
}

export function read<T extends TypeReader>(s: _stream, spec: T, obj?: any) : ReadType<T> {
	if (isReader(spec))
		return spec.get(s);

	if (!obj)
		obj = {obj: s.obj} as any;
	s.obj	= obj;
	Object.entries(spec).forEach(([k, t]) => obj[k] = read(s, t));
	s.obj	= obj.obj;
	delete obj.obj;
	return obj;
}
function read_merge<T extends TypeReader>(s: _stream, specs: T) {
	Object.entries(specs).forEach(([k, v]) => s.obj[k] = isReader(v) ? v.get(s) : read(s, v as TypeReader));
}

export function read_more<T extends TypeReader, O extends Record<string, any>>(s: _stream, specs: T, obj: O) : ReadType<T> & O {
	s.obj = obj;
	Object.entries(specs).forEach(([k, v]) => s.obj[k] = isReader(v) ? v.get(s) : read_more(s, v as TypeReader, s.obj[k]));
	return s.obj;
}

export function write(s: _stream, type: TypeWriter, value: any) : void {
	if (isWriter(type)) {
		type.put(s, value);
		return;
	}
	s.obj = value;
	Object.entries(type).map(([k, t]) => write(s, t, value[k]));
}

export function readn<T extends TypeReader>(s: _stream, type: T, n: number) : ReadType<T>[] {
	const result: ReadType<T>[] = [];
	for (let i = 0; i < n; i++)
		result.push(read(s, type));
	return result;
}

export function writen(s: _stream, type: any, v: any) {
	for (const i of v)
		write(s, type, i);
}

//-----------------------------------------------------------------------------
// possibly async versions of read/write
//-----------------------------------------------------------------------------

type get2<T> = ((s: _stream) => T) & ((s: async._stream) => Promise<T>);
type put2<T> = ((s: _stream, v: T) => void) & ((s: async._stream, v: T) => Promise<void>);
export interface TypeReaderT2<T> { get: get2<T>; }
export interface TypeWriterT2<T> { put: put2<T>; }
export type TypeT2<T>	= TypeReaderT2<T> & TypeWriterT2<T>;
export type TypeX2<T>	= TypeT2<T> | TypeX0<T>;
export type Type2		= Type | async.Type;

export function read2<T extends TypeReader>(s: _stream, spec: T, obj?: any) : ReadType<T>;
export function read2<T extends async.TypeReader>(s: async._stream, spec: T, obj?: any) : Promise<ReadType<T>>;
export function read2<T extends TypeReader|async.TypeReader>(s: _stream|async._stream, spec: T, obj?: any) : MaybePromise<ReadType<T>>;
export function read2<T extends TypeReader|async.TypeReader>(s: any, spec: T, obj?: any) : MaybePromise<ReadType<T>> {
	if (isReader(spec))
		return maybePromise(spec.get(s), value => value);

	if (!obj)
		obj = {obj: s.obj} as any;
	s.obj	= obj;

    return maybePromise(Object.entries(spec).reduce((acc: any, [k, t]) => 
        maybePromise(acc, () => maybePromise(read2(s, t), value => obj[k] = value))
    , undefined), () => {
		s.obj	= obj.obj;
		delete obj.obj;
		return obj;
	});
}

function read_merge2<T extends Type2>(s: _stream|async._stream, specs: T): MaybePromise<void> {
	return Object.entries(specs).reduce((acc: any, [k, v]) =>
		maybePromise(acc, () => maybePromise(read2(s as any, v as any), value => s.obj[k] = value))
	, undefined);
}

export function write2(s: _stream, type: TypeWriter, value: any) : void;
export function write2(s: async._stream, type: async.TypeWriter, value: any) : Promise<void>;
export function write2(s: _stream|async._stream, type: TypeWriter|async.TypeWriter, value: any) : MaybePromise<void>;
export function write2(s: any, type: TypeWriter|async.TypeWriter, value: any) : MaybePromise<void> {
	if (isWriter(type)) {
		type.put(s, value);
		return;
	}
	s.obj = value;
    return Object.entries(type).reduce((acc: any, [k, t]) => 
        maybePromise(acc, () => write2(s, t, value[k]))
    , undefined);
}

export function readn2<T extends TypeReader>(s: _stream, type: T, n: number) : ReadType<T>[];
export function readn2<T extends async.TypeReader>(s: async._stream, type: T, n: number) : Promise<ReadType<T>[]>;
export function readn2<T extends TypeReader|async.TypeReader>(s: _stream|async._stream, type: T, n: number) : MaybePromise<ReadType<T>[]>;
export function readn2<T extends TypeReader|async.TypeReader>(s: any, type: T, n: number) : MaybePromise<ReadType<T>[]> {
	const result: ReadType<T>[] = [];
	let acc: any = undefined;
	for (let i = 0; i < n; i++)
		acc = maybePromise(acc, () => maybePromise(read2(s, type), value => result.push(value)));
	return maybePromise(acc, () => result);
}

export function writen2(s: _stream, type: TypeWriter, v: any): void;
export function writen2(s: async._stream, type: async.TypeWriter, v: any): Promise<void>;
export function writen2(s: _stream|async._stream, type: TypeWriter|async.TypeWriter, v: any): MaybePromise<void>;
export function writen2(s: any, type: any, v: any) {
    return v.reduce((acc: any, i: any) => 
        maybePromise(acc, () => write2(s, type, i))
    , undefined);
}

//-----------------------------------------------------------------------------
// readx, writex - possibly async
//-----------------------------------------------------------------------------

export function readx<T extends object | number | string | boolean>(s: _stream, type: TypeX<T>): T;
export function readx<T extends object | number | string | boolean>(s: async._stream, type: async.TypeX<T>): Promise<T>;
export function readx<T extends object | number | string | boolean>(s: _stream | async._stream, type: TypeX2<T>): MaybePromise<T>;
export function readx<T extends object | number | string | boolean>(s: any, type: TypeX2<T>) {
	return typeof type === 'function'	? type(s)
		:	isReader(type)				? type.get(s)
		:	type;
}
export function writex<T extends object | number | string>(s: _stream, type: TypeX<T>, value: T) : T;
export function writex<T extends object | number | string>(s: async._stream, type: async.TypeX<T>, value: T): Promise<T>;
export function writex<T extends object | number | string>(s: _stream | async._stream, type: TypeX2<T>, value: T): MaybePromise<T>;
export function writex<T extends object | number | string>(s: any, type: TypeX2<T>, value: T) {
	return typeof type === 'function'	? type(s)
		:	isWriter(type)				? maybePromise(type.put(s, value), () => value)
		:	type;
}

export function getx<T extends object | number | string | boolean>(s: any, type: TypeX0<T>): T {
	return typeof type === 'function'	? type(s)
		:	type;
}

//-----------------------------------------------------------------------------
//	numeric types
//-----------------------------------------------------------------------------

//type TypeNumber<T extends number> = T extends 8 | 16 | 24 | 32 | 40 | 48 | 56
//	? TypeT<number>
//	: TypeT<bigint>;

type TypeNumber2<T extends number> = T extends 8 | 16 | 24 | 32 | 40 | 48 | 56
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
	get: ((s => maybePromise(s.view(DataView, 1), dv => dv.getUint8(0))) as get2<number>),
	put: ((s, v) => maybePromise(s.view(DataView, 1), dv => dv.setUint8(0, v))) as put2<number>,
};
export const INT8: TypeT2<number> = {
	get: ((s => maybePromise(s.view(DataView, 1), dv => dv.getInt8(0))) as get2<number>),
	put: ((s, v) => maybePromise(s.view(DataView, 1), dv => dv.setInt8(0, v))) as put2<number>,
};

//16 bit
function _UINT16(be?: boolean): TypeT2<number> { return {
	get: ((s => maybePromise(s.view(DataView, 2), dv => dv.getUint16(0, !be))) as get2<number>),
	put: ((s, v) => maybePromise(s.view(DataView, 2), dv => dv.setUint16(0, v, !be))) as put2<number>,
};};
function _INT16(be?: boolean): TypeT2<number> { return {
	get: ((s => maybePromise(s.view(DataView, 2), dv => dv.getInt16(0, !be))) as get2<number>),
	put: ((s, v) => maybePromise(s.view(DataView, 2), dv => dv.setInt16(0, v, !be))) as put2<number>,
};};
export const UINT16_LE	= _UINT16(false);
export const UINT16_BE	= _UINT16(true);
export const INT16_LE	= _INT16(false);
export const INT16_BE 	= _INT16(true);
export const UINT16		= endian_from_stream(_UINT16);
export const INT16		= endian_from_stream(_INT16);

//32 bit
function _UINT32(be?: boolean): TypeT2<number> { return {
	get: ((s => maybePromise(s.view(DataView, 4), dv => dv.getUint32(0, !be))) as get2<number>),
	put: ((s, v) => maybePromise(s.view(DataView, 4), dv => dv.setUint32(0, v, !be))) as put2<number>,
};};
function _INT32(be?: boolean): TypeT2<number> { return {
	get: ((s => maybePromise(s.view(DataView, 4), dv => dv.getInt32(0, !be))) as get2<number>),
	put: ((s, v) => maybePromise(s.view(DataView, 4), dv => dv.setInt32(0, v, !be))) as put2<number>,
};};
export const UINT32_LE	= _UINT32(false);
export const UINT32_BE	= _UINT32(true);
export const INT32_LE	= _INT32(false);
export const INT32_BE 	= _INT32(true);
export const UINT32 	= endian_from_stream(_UINT32);
export const INT32 		= endian_from_stream(_INT32);

//64 bit 
function _UINT64(be?: boolean): TypeT2<bigint> { return {
	get: ((s => maybePromise(s.view(DataView, 8), dv => utils.getBigUint(dv, 8, !be))) as get2<bigint>),
	put: ((s, v) => maybePromise(s.view(DataView, 8), dv => utils.putBigUint(dv, v, 8, !be))) as put2<bigint>,
};};
function _INT64(be?: boolean): TypeT2<bigint> { return {
	get: ((s => maybePromise(s.view(DataView, 8), dv => utils.getBigInt(dv, 8, !be))) as get2<bigint>),
	put: ((s, v) => maybePromise(s.view(DataView, 8), dv => utils.putBigUint(dv, v, 8, !be))) as put2<bigint>,
};};

export const UINT64_LE	= _UINT64(false);
export const UINT64_BE	= _UINT64(true);
export const INT64_LE	= _INT64(false);
export const INT64_BE	= _INT64(true);
export const UINT64		= endian_from_stream(_UINT64);
export const INT64		= endian_from_stream(_INT64);

//computed int
export function UINT<T extends number>(bits: T, be?: boolean): TypeNumber2<T> {
	if (bits & 7)
		throw new Error('bits must be multiple of 8');

	return (bits === 8 ? UINT8
		: bits > 56
		? endian((be?: boolean) => ({
			get: ((s => maybePromise(s.view(DataView, bits / 8), dv => utils.getBigUint(dv, bits / 8, !be))) as get2<bigint>),
			put: ((s, v) => maybePromise(s.view(DataView, bits / 8), dv => utils.putBigUint(dv, v, bits / 8, !be))) as put2<bigint>
		}), be)
		: endian(bits == 16 ? _UINT16 : bits == 32 ? _UINT32 :
		(be?: boolean) => ({
			get: ((s => maybePromise(s.view(DataView, bits / 8), dv => utils.getUint(dv, bits / 8, !be))) as get2<number>),
			put: ((s, v) => maybePromise(s.view(DataView, bits / 8), dv => utils.putUint(dv, v, bits / 8, !be))) as put2<number>
		}), be)
	 ) as TypeNumber2<T>;
}

export function INT<T extends number>(bits: T, be?: boolean): TypeNumber2<T> {
	if (bits & 7)
		throw new Error('bits must be multiple of 8');

	return (bits === 8 ? UINT8
		: bits > 56
		? endian((be?: boolean) => ({
			get: ((s => maybePromise(s.view(DataView, bits / 8), dv => utils.getBigInt(dv, bits / 8, !be))) as get2<bigint>),
			put: ((s, v) => maybePromise(s.view(DataView, bits / 8), dv => utils.putBigUint(dv, v, bits / 8, !be))) as put2<bigint>
		}), be)
		: endian(bits == 16 ? _INT16 : bits == 32 ? _INT32 :
		(be?: boolean) => ({
			get: ((s => maybePromise(s.view(DataView, bits / 8), dv => utils.getInt(dv, bits / 8, !be))) as get2<number>),
			put: ((s, v) => maybePromise(s.view(DataView, bits / 8), dv => utils.putUint(dv, v, bits / 8, !be))) as put2<number>
		}), be)
	) as TypeNumber2<T>;
}

//float
function _Float32(be?: boolean): TypeT2<number> { return {
	get: ((s => maybePromise(s.view(DataView, 4), dv => dv.getFloat32(0, !be))) as get2<number>),
	put: ((s, v) => maybePromise(s.view(DataView, 4), dv => dv.setFloat32(0, v, !be))) as put2<number>
};};
function _Float64(be?: boolean): TypeT2<number> { return {
	get: ((s => maybePromise(s.view(DataView, 8), dv => dv.getFloat64(0, !be))) as get2<number>),
	put: ((s, v) => maybePromise(s.view(DataView, 8), dv => dv.setFloat64(0, v, !be))) as put2<number>
};};
export const Float32_LE = _Float32(false);
export const Float32_BE = _Float32(true);
export const Float64_LE = _Float64(false);
export const Float64_BE = _Float64(true);
export const Float32	= endian_from_stream(_Float32);
export const Float64	= endian_from_stream(_Float64);


//leb128
export const ULEB128: TypeT2<number|bigint> = {
	get: (s => maybePromise(s.remainder(), buffer => {
		let t = 0;
		let	i = 0;
		let b;
		while ((b = buffer[i]) & 0x80 && i < 6)
			t |= (b & 0x7f) << (i++ * 7);

		if (!(b & 0x80)) {
			s.skip(i + 1);
			return t;
		}
		let tn = BigInt(t);
		while ((b = buffer[i]) & 0x80)
			tn |= BigInt(b & 0x7f) << BigInt(i++ * 7);
		tn |= BigInt(b) << BigInt(i * 7);
		s.skip(i + 1);
		return tn;
	})) as get2<number|bigint>,
	put: ((s, v) => {
		const n = utils.highestSetIndex(v) / 7 + 1;
		const buffer = new Uint8Array(n);
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
		return s.write_buffer(buffer);
	}) as put2<number|bigint>,
};

//-----------------------------------------------------------------------------
//	string types
//-----------------------------------------------------------------------------

export function StringType(len: TypeX2<number>, encoding: utils.TextEncoding = 'utf8', zeroTerminated = false, lenScale?: number): TypeT2<string> {
	const rawScale = encoding == 'utf8' ? 1 : 2;
	const lenScale2 = lenScale ?? rawScale;
	return {
		get: ((s => maybePromise(readx(s, len), len2 => maybePromise(s.read_buffer(len2 * lenScale2), buffer => {
			const v = utils.decodeText(buffer, encoding);
			const z = zeroTerminated ? v.indexOf('\0') : -1;
			return z >= 0 ? v.substring(0, z) : v;
		}))) as get2<string>),
		put: ((s, v) => {
			if (zeroTerminated)
				v += '\0';
			return maybePromise(writex(s, len, v.length * rawScale / lenScale2), len2 => maybePromise(s.view(Uint8Array, len2 * lenScale2), buffer => {
				utils.encodeTextInto(v, buffer, encoding);
			}));
		}) as put2<string>,
	};
}

export function NullTerminatedStringType(encoding: utils.TextEncoding = 'utf8'): TypeT2<string> {
	return StringType(encoding === 'utf8'
		? s => maybePromise(s.remainder(), r => r.indexOf(0) + 1)
		: s => maybePromise(s.remainder(), r => new Uint16Array(r).indexOf(0) + 1)
		, encoding, true, 1);
};

export function RemainingStringType(encoding: utils.TextEncoding = 'utf8', zeroTerminated = false): TypeT2<string> {
	return {
		get: (s => maybePromise(s.remainder(), r => utils.decodeText(r, encoding))) as get2<string>,
		put: ((s, v) => {
			if (zeroTerminated)
				v += '\0';
			return maybePromise(s.remainder(), buffer => utils.encodeTextInto(v, buffer, encoding));
		}) as put2<string>,
	};
}

//-----------------------------------------------------------------------------
//	array types
//-----------------------------------------------------------------------------

export function ArrayType<T extends Type2>(len: TypeX2<number>, type: T) {
	type R = ReadType<T>[];
	return {
		get: ((s => maybePromise(readx(s, len), n => readn2(s, type, n))) as get2<R>) as get2<R>,
		put: ((s, v) => { writex(s, len, v.length); writen2(s, type, v); }) as put2<R>
	} as TypeT2<R>;
}

export function RemainingArrayType<T extends Type2>(type: T) {
	type R = ReadType<T>[];
	return {
		get: (s => {
			const result: R = [];
			const readNext = (): any => {
				if (!s.remaining())
					return result;
				try {
					return maybePromise(read2(s, type), value => {
						if (value === undefined)
							return result;
						result.push(value);
						return readNext();
					});
				} catch (_) {
					return result;
				}
			};
			return readNext();
		}) as get2<R>,
		put: ((s, v) => writen2(s, type, v)) as put2<R>
	} as TypeT2<R>;
}

export function withNames<T>(array: T[], func:(v: T, i: number)=>string) : [string, T][] {
	return array.map((v, i) => [func(v, i) ?? `#${i}`, v] as [string, T]);
}

export const field = (field: string) 	=> (v: any) => v[field];
export const names = (names: string[])	=> (v: any, i: number) => names[i];

export function arrayWithNames<T extends Type2>(type: T, func:(v: any, i: number)=>string) {
	type R = [string, ReadType<T> extends Array<infer E> ? E : never][];
	return {
		get: (s => maybePromise(read2(s, type), array => withNames(array, func))) as get2<R>,
		put: ((s, v) => write2(s, type, v.map(([, v]) => v))) as put2<R>
	} as TypeT2<R>;
}

export function objectWithNames<T extends Type2>(type: T, func:(v: any, i: number)=>string) {
	type R = Record<string, ReadType<T> extends Array<infer E> ? E : never>;
	return {
		get: (s => maybePromise(read2(s, type), array => Object.fromEntries(withNames(array, func)))) as get2<R>,
		put: ((s, v) => write2(s, type, Object.values(v))) as put2<R>
	} as TypeT2<R>;
}

//-----------------------------------------------------------------------------
//	other types
//-----------------------------------------------------------------------------

export function Struct<T extends Type2>(spec: T): TypeT2<ReadType<T>> {
	return {
		get:(s => read2(s, spec)) as get2<ReadType<T>>,
		put:((s, v) => write2(s, spec, v)) as put2<ReadType<T>>
	};
}

type SpecT<T> = TypeT<T> | {
	[K in keyof T]: SpecT<T[K]>
}
type SpecT2<T> = TypeT2<T> | {
	[K in keyof T]: SpecT2<T[K]>
}
export function StructT<T>(spec: SpecT2<T>): TypeT2<T> {
	return {
		get: (s 		=> read2(s, spec) as T) as get2<T>,
		put: ((s, v)	=> write2(s, spec, v)) as put2<T>
	};
}

export const Remainder: TypeT2<Uint8Array> = {
	get:(s => maybePromise(s.remainder(), r => r)) as get2<Uint8Array>,
	put:((s, v) => maybePromise(s.write_buffer(v), () => undefined)) as put2<Uint8Array>
};

export function Buffer<T extends ArrayBufferView = Uint8Array>(len: TypeX2<number>, view: View<T> = Uint8Array as any): TypeT2<T> {
	const bytesPerElement = view.prototype.BYTES_PER_ELEMENT || 1;
	return {
		get: (s => maybePromise(readx(s, len), n => maybePromise(s.read_buffer(n * bytesPerElement), buf => new view(buf.buffer, buf.byteOffset, buf.byteLength / bytesPerElement)))) as get2<T>,
		put: ((s, v) => maybePromise(writex(s, len, v.byteLength / bytesPerElement), () => s.write_buffer(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)))) as put2<T>
	};
}

export function SkipType(len: number): TypeT2<void> {
	return {
		get: (s => maybePromise(s.skip(len), () => undefined)) as get2<void>,
		put: (s => maybePromise(s.skip(len), () => undefined)) as put2<void>
	};
}

export function AlignType(align: number): TypeT2<void> {

	return {
		get: (s => maybePromise(alignStream(s as any, align), () => undefined)) as get2<void>,
		put: (s => maybePromise(alignStream(s as any, align), () => undefined)) as put2<void>
	};
}

export function Discard(type: Type2): TypeT2<undefined> {
	return {
		get: (s => maybePromise(read2(s, type), () => undefined)) as get2<undefined>,
		put: ((_s, _v) => undefined) as put2<undefined>
	};
}

export function DontRead<T>(): TypeT2<T|undefined> {
	return {
		get: (_s => undefined) as get2<T|undefined>,
		put: ((_s, _v) => undefined) as put2<T|undefined>
	};
}

export function Const<T>(t: T): TypeT2<T> {
	return {
		get: (_s => t) as get2<T>,
		put: ((_s, _v) => undefined) as put2<T>
	};
}

export function Expect<T extends Type2>(type: T, t: ReadType<T>): TypeT2<undefined> {
	return {
		get: (s => maybePromise(read2(s, type), x => {
			if (x !== t)
				throw new Error(`Expected ${t}, got ${x}`);
			return undefined;
		})) as get2<undefined>,
		put: (s => write2(s, type, t)) as put2<undefined>
	};
}

export function SizeType<T extends Type2>(len: TypeX2<number>, type: T): TypeT2<ReadType<T>> {
	return {
		get: (s => maybePromise(readx(s, len), size => {
			const s2	= clone(s as any) as stream;
			s.skip(size);
			s2.end		= s2.offset + size;
			return read2(s2, type);
		})) as get2<ReadType<T>>,
		put: ((_s, _v) => undefined) as put2<ReadType<T>>
	};
}

export function OffsetType<T extends Type2>(offset: TypeX2<number>, type: T): TypeT2<ReadType<T>> {
	return {
		get: (s => maybePromise(readx(s, offset), off => {
			const s2	= clone(s as any) as stream;
			s2.offset	= s2.offset0 += off;
			return read2(s2, type);
		})) as get2<ReadType<T>>,
		put: ((_s, _v) => undefined) as put2<ReadType<T>>
	};
}

export function MaybeOffsetType<T extends Type2>(offset: TypeX2<number>, type: T): TypeT2<ReadType<T> | undefined> {
	return {
		get: (s => maybePromise(readx(s, offset), off => {
			if (off) {
				const s2	= clone(s as any) as stream;
				s2.offset	= s2.offset0 += off;
				return read2(s2, type);
			}
		})) as get2<ReadType<T> | undefined>,
		put: ((_s, _v) => undefined) as put2<ReadType<T> | undefined>
	};
}

export function Func<T>(func: (s: _stream|async._stream)=>MaybePromise<T>): TypeT2<T> {
	return {
		get: (s => func(s)) as get2<T>,
		put: ((_s, _v) => undefined) as put2<T>
	};
}

export function FuncType<T extends Type2>(func: (s: _stream|async._stream)=>T): TypeT2<ReadType<T>> {
	return {
		get: (s => maybePromise(func(s), t => read2(s, t))) as get2<ReadType<T>>,
		put: ((_s, _v) => undefined) as put2<ReadType<T>>
	};
}

function CountMatchingFields(keys: Set<string>, spec: any) {
	return Object.keys(spec).reduce((acc, key) => acc + (keys.has(key) ? 1 : 0), 0);
}

//discriminator - determine which of several types value is based on which fields are present
export function Discriminator<T extends Record<string | number, any>>(value: any, switches: T) {
	if (typeof value === 'object') {
		const keys = new Set(Object.keys(value));
		const counts = Object.values(switches).map((spec: any) => CountMatchingFields(keys, spec));
		return Object.keys(switches)[counts.reduce((best, n, i) => n > counts[best] ? i : best, 0)];
	}
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
		get: (s => maybePromise(readx(s, test), x => {
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
				return maybePromise(writex(s, test, t as any), () => write2(s, t ? type : false_type as Type2, v));
		}) as put2<R>
	};
}


export function If<T extends Type2, F extends Type2 | undefined = undefined>(test: TypeX2<boolean | number>, true_type: T, false_type?: F, discriminator = (value: any) => Discriminator(value, { true: true_type, false: false_type } as any)) {
	type R = F extends Type2 ? ReadType<T | F> : ReadType<T | undefined>;
	return {
		get: (s => maybePromise(readx(s, test), x => maybePromise(
			false_type ? read_merge2(s, x ? true_type : false_type) : x ? read_merge2(s, true_type) : undefined,
			() => ({} as MergeType<R>)
		))) as get2<MergeType<R>>,
		put: ((s, v) => {
			if (!isWriter(test))
				return write2(s, getx(s, test) ? true_type : false_type as Type2, v);
			const t = discriminator(v);
			if (t !== undefined)
				return maybePromise(writex(s, test, t as any), () => write2(s, t ? true_type : false_type as Type2, v));
		}) as put2<MergeType<R>>
	};
}

export function Switch<K extends string | number, T extends Record<K, Type2>>(test: TypeX2<K>, switches: T, discriminator = (value: any) => Discriminator(value, switches as any)) {
	type R = ReadType<T[keyof T]>;
	return {
		get: (s => maybePromise(readx(s, test), key => {
			const t = switches[key as keyof T];
			return t && read2(s, t);
		})) as get2<R>,
		put: ((s, v) => {
			if (!isWriter(test))
				return write2(s, switches[getx(s, test) as keyof T], v);
			const t = discriminator(v);
			if (t !== undefined)
				return maybePromise(writex(s, test, t as any), () => write2(s, switches[t as keyof T], v));
		}) as put2<R>
	} as TypeT2<R>;
}

//-----------------------------------------------------------------------------
//	AS - read as one type, return another
//-----------------------------------------------------------------------------

type Constructor<T, D, O=void>		= new (arg: T, opt: O) => D;
type Factory<T, D, O=void>			= (arg: T, opt: O) => D;
type ClassOrFactory<T, D, O=void>	= Constructor<T, D, O> | Factory<T, D, O>;

function isConstructor<T, D, O>(maker: ClassOrFactory<T,D,O>): maker is Constructor<T,D,O> {
	return maker.prototype?.constructor.name;
}

function make<T, D, O>(maker: ClassOrFactory<T,D,O>, arg: T, opt?: O) {
	return isConstructor(maker) ? new maker(arg, opt as O) : maker(arg, opt as O);
}

export function as<T extends Type2, D>(type: T, maker: ClassOrFactory<ReadType<T>, D, _stream|async._stream>) : TypeT2<D> {
	return {
		get: (s => maybePromise(read2(s, type), v => make(maker, v, s))) as get2<D>,
		put: ((s, v) => write2(s, type, v)) as put2<D>
	};
}

export class hex<T extends number | bigint> {
	constructor(public value: T) {}
	valueOf()	{ return this.value; }
	toString()	{ return '0x' + this.value.toString(16); }
};

export function asHex(type: TypeT2<number> | TypeT2<bigint> | TypeT2<number|bigint>): TypeT2<hex<number|bigint>> {
	return as(type as any, hex as any) as TypeT2<hex<number|bigint>>;
}

export function asInt<T extends string>(type: TypeT2<T>, radix = 10) {
	return as(type, x => parseInt(x.trim(), radix));
}

export function asFixed<T extends number>(type: TypeT2<T>, fracbits: number) {
	const scale = 1 / (1 << fracbits);
	return as(type, x => x * scale);
}

// enum helpers

export type EnumType = {
	[key: string]:	string | number;
	[value: number]: string;
} | {[key: string]:	number};

export function EnumV<T extends EnumType>(_: T) {
	return (x: number) => x as T[keyof T] & number;
}

export function Enum(e: EnumType) {
	const e1 = (Object.entries(e).filter(([, v]) => typeof v === 'number') as [string, number][]).sort(([, v1], [, v2]) => v2 - v1);
	const e2 = Object.fromEntries(e1.map(([k, v]) => [v, k]));

	function split_enum(x: number) {
		const results: string[] = [];
		for (const k of e1) {
			if (k[1] === 0) {
				if (x == 0)
					return k[0];
				break;
			}
			const n = Math.floor(x / k[1]);
			if (n) {
				results.push(n > 1 ? `${k[0]}*${n}` : k[0]);
				x %= k[1];
				if (!x)
					break;
			}
		}
		if (results.length == 0)
			return x.toString();

		if (x)
			results.push(x.toString());
		return results.join('+');
	}
	
	return (x: number | bigint) => e2[Number(x)] ?? split_enum(Number(x));
}

export function Flags(e: EnumType, noFalse: boolean) {
	const e1 = Object.entries(e).filter(([, v]) => typeof v === 'number') as [string, number][];

	return (x: number | bigint) => typeof x === 'bigint'
	?	e1.reduce((obj, [k, v]) => {
		const y = x & BigInt(v);
		if (y || !noFalse)
			obj[k] = !utils.isPow2(v) ? y / BigInt(utils.lowestSet(v)) : !!y;
		return obj;
	}, {} as Record<string, bigint | boolean>)
	:	e1.reduce((obj, [k, v]) => {
		const y = x & v;
		if (y || !noFalse)
			obj[k] = !utils.isPow2(v) ? y / utils.lowestSet(v) : !!y;
		return obj;
	}, {} as Record<string, number | boolean>);

}

export type BitField<D> = [number, ClassOrFactory<number, D>];

export function BitFields<T extends Record<string, number | BitField<any>>>(bitfields: T) {
	return <V extends number | bigint>(x: V): {[K in keyof T]: T[K] extends BitField<infer D> ? D : V;} => {
		if (typeof x === 'bigint') {
			let y: bigint = x;
			const obj = {} as Record<string, bigint>;
			for (const i in bitfields) {
				const bf	= bitfields[i];
				const bits	= typeof bf === 'number' ? bf : bf[0];
				const v		= y & ((1n << BigInt(bits)) - 1n);
				y >>= BigInt(bits);
				obj[i] = typeof bf === 'number' ? v : make(bf[1], Number(v));
			}
			return obj as any;
		} else {
			const obj = {} as Record<string, number>;
			let y: number = x;
			for (const i in bitfields) {
				const bf	= bitfields[i];
				const bits	= typeof bf === 'number' ? bf : bf[0];
				const v		= y & ((1 << bits) - 1);
				y >>= bits;
				obj[i] = typeof bf === 'number' ? v : make(bf[1], v);
			}
			return obj as any;
		}
	};
}

//shortcuts
export function asEnum<T extends TypeT<number | bigint>, E extends EnumType>(type: T, e: E) {
	return as(type, Enum(e));
}
export function asFlags<T extends TypeT<number | bigint>, E extends EnumType>(type: T, e: E, noFalse = true) {
	return as(type, Flags(e, noFalse));
}

//-----------------------------------------------------------------------------
//	memory utilities
//-----------------------------------------------------------------------------

export interface memory {
	length?: bigint;
	get(address: bigint, len: number): Uint8Array | Promise<Uint8Array>;
}

export class MappedMemory {
	static readonly	NONE	 	= 0;	// No permissions
	static readonly	READ	 	= 1;	// Read permission
	static readonly	WRITE		= 2;	// Write permission
	static readonly	EXECUTE  	= 4;	// Execute permission
	static readonly	RELATIVE	= 8;	// address is relative to dll base

	constructor(public data: Uint8Array, public address: bigint, public flags: number) {}
	resolveAddress(_base: number)		{ return this.address; }
	slice(begin: number, end?: number)	{ return new MappedMemory(this.data.subarray(begin, end), this.address + BigInt(begin), this.flags); }
	atRelative(begin: number, length?: number)	{ return this.slice(begin, length && (begin + length)); }
	at(begin: bigint, length?: number)	{ return this.atRelative(Number(begin - this.address), length); }
}
