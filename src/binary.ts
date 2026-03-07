import * as utils from './utils';
export * as utils from './utils';

import * as async from './async';
export * as async from './async';

import { after, MaybePromise, TypedArray, ViewMaker } from './utils';

type NoPromise<T> = T extends PromiseLike<infer R> ? R : T;

//-----------------------------------------------------------------------------
//	stream
//-----------------------------------------------------------------------------

export interface _stream {
	be?:			boolean;				// read numbers as bigendian/littleendian
	obj?:			any;					// current object being read
	atend?:			(s: _stream) => void;	// callback for when stream finished
	tell():			number;					// current offset from start of file
	seek(offset: number):	void;			// set current offset from start of file
	view<T>(type: ViewMaker<T>, len: number, strict?: boolean): T;
}

export function remainder(s: _stream|async._stream) {
	const tell = s.tell();
	const chunk = (nextSize: number): any => after(
		s.view(Uint8Array, nextSize, false),
		data => {
			if (data.length < nextSize)
				return data;
			s.seek(tell);
			return chunk(nextSize * 2);
		}
	);
	return chunk(16);
}

//compatibility stubs
export function read_buffer(s: _stream, len: number) {
	return s.view(Uint8Array, len);
}
export function write_buffer(s: _stream, buf: Uint8Array) {
	s.view(Uint8Array, buf.length).set(buf);
}
function skip(s: _stream|async._stream, len: number) {
	s.seek(s.tell() + len);
}
export function buffer_at(s: _stream, offset: number, len?: number) {
	const pos = s.tell();
	s.seek(offset);
	const result = len ? s.view(Uint8Array, len) : remainder(s);
	s.seek(pos);
	return result;
}

type StreamResult<S extends _stream|async._stream, T> = S extends _stream ? T : Promise<T>;

class OffsetProxy<S extends _stream|async._stream> {
	be?: boolean;

	constructor(private s: S, private offset: number, private end?: number) {
		this.be = s.be;
	}

	tell() {
		return this.s.tell() - this.offset;
	}
	seek(offset2: number) {
		this.s.seek(offset2 + this.offset);
	}
	view<T>(type: ViewMaker<T>, len: number, strict?: boolean) {
		if (this.end) {
			const bytesPerElement = type.BYTES_PER_ELEMENT || 1;
			if (len * bytesPerElement > this.end - this.tell()) {
				if (strict)
					throw new Error('stream: out of bounds');
				len = Math.floor((this.end - this.tell()) / bytesPerElement);
			}
		}
		return this.s.view(type, len, strict) as StreamResult<S, T>;
	}
}

export function offsetStream<S extends _stream|async._stream>(s: S, offset: number, size?: number): S extends _stream ? _stream : async._stream {
	return new OffsetProxy(s, offset, size) as any;
}

export class BufferStream implements _stream {
	obj?:	any;
	atend?: (s: _stream) => void;

	protected offset	= 0;
	protected end:		number;

	constructor(public buffer: ArrayBufferLike, public be?: boolean) {
		this.end	= buffer.byteLength;
	}
	tell() {
		return this.offset;
	}
	seek(offset: number) {
		this.offset = offset;
	}
	view<T>(type: ViewMaker<T>, len: number, strict = true): T {
		const bytesPerElement = type.BYTES_PER_ELEMENT || 1;
		let byteLength = len * bytesPerElement;
		if (this.offset + byteLength > this.end) {
			if (strict)
				throw new Error('stream: out of bounds');
			len = Math.floor((this.end - this.offset) / bytesPerElement);
			byteLength = len * bytesPerElement;
		}
		const offset = this.offset;
		this.offset += byteLength;
		return new type(this.buffer, offset, len);
	}
}

export class stream extends OffsetProxy<BufferStream> {
	constructor(data: Uint8Array, be?: boolean) {
		const base = new BufferStream(data.buffer, be);
		base.seek(data.byteOffset);
		super(base, data.byteOffset, data.byteLength);
	}
}

export class growingStream extends BufferStream {
	constructor() {
		super(new ArrayBuffer(1024));
	}
	private checksize(len: number) {
		if (this.offset + len > this.buffer.byteLength) {
			const buffer = new ArrayBuffer(Math.max(this.buffer.byteLength * 2, this.offset + len));
			new Uint8Array(buffer).set(new Uint8Array(this.buffer));
			this.buffer	= buffer;
			this.end	= this.buffer.byteLength;
		}
	}
	view<T>(type: ViewMaker<T>, len: number): T {
		this.checksize(len * (type.BYTES_PER_ELEMENT ?? 1));
		return super.view(type, len);
	}
	terminate() {
		this.atend?.(this);
		return new Uint8Array(this.buffer, 0, this.offset);
	}
}

export class dummy implements _stream {
	offset = 0;
	
	tell() 					{ return this.offset; }
	seek(offset: number) 	{ this.offset = offset; }

	view<T>(type: ViewMaker<T>, len: number): T {
		const dv = new type(global.Buffer.alloc(len).buffer, 0, len);
		this.offset += len;
		return dv;
	}
	finish(): void {}
}

//-----------------------------------------------------------------------------
//	Types
//-----------------------------------------------------------------------------

export interface TypeReaderT<T> { get(s: _stream): T }
export interface TypeWriterT<T> { put(s: _stream, v: T): void }
export type TypeT<T>	= TypeReaderT<T> & TypeWriterT<T>;

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

export interface WithStaticGet {
	get:<X extends abstract new (...args: any) => any>(this: X, s: _stream) => InstanceType<X>
}
export interface WithStaticPut {
	put:(s: _stream, v: any) => void
}

export function ReadClass<T extends TypeReader>(spec: T) {
	return class {
		static get(s: _stream) {
			return new this(s);
		}
		constructor(s: _stream) {
			return Object.assign(this, read(s, spec));
		}
	} as (new(s: _stream) => ReadType<T>) & WithStaticGet;
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
	} as (new(s: _stream | ReadType<T>) => ReadType<T> & { write(w: _stream): void }) & WithStaticGet & WithStaticPut;
}

export function Extend<B extends (abstract new (...args: any[]) => any) & WithStaticPut, T extends Type>(base: B, spec: T) {
	abstract class Class extends base {
		static get(s: _stream) {
			return new (this as any)(s);
		}
		static put(s: _stream, v: Class) {
			base.put(s, v);
			write(s, spec, v);//TBD
		}
		constructor(...args: any[]) {
			super(...args);
			if ('tell' in args[0]) {
				const s: _stream = args[0];
				const obj = s.obj;
				this.obj = obj;
				read(s, spec, this);
				delete this.obj;
			}
		}
		write(s: _stream) 	{
			super.write?.(s);
			write(s, spec, this);
		}
	};
	type BaseData = B extends new (data: infer D) => any ? D : never;
	return Class as unknown as (new(s: _stream | (BaseData & ReadType<T>)) => InstanceType<B> & ReadType<T>) & WithStaticGet & WithStaticPut;
}

//-----------------------------------------------------------------------------
// synchronous versions of read/write
//-----------------------------------------------------------------------------

export type TypeX0<T>	= string | ((s: _stream, value?: T)=>T) | T
export type TypeX<T>	= TypeT<T> | TypeX0<T>;

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
//function read_merge<T extends TypeReader>(s: _stream, specs: T) {
//	Object.entries(specs).forEach(([k, v]) => s.obj[k] = isReader(v) ? v.get(s) : read(s, v as TypeReader));
//}

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

export function readx<T extends object | number | string | boolean>(s: _stream, type: TypeX<T>) {
	return isReader(type)				? type.get(s)
		:	typeof type === 'function'	? type(s)
		:	typeof type === 'string'	? s.obj[type]
		:	type;
}
export function writex<T extends object | number | string>(s: _stream, type: TypeX<T>, value: T) {
	return isWriter(type)				? (type.put(s, value), value)
		:	typeof type === 'function'	? type(s, value)
		:	typeof type === 'string'	? s.obj[type]
		:	type;
}

export function getx<T extends object | number | string | boolean>(s: any, type: TypeX0<T>): T {
	return typeof type === 'function'	? type(s)
		:	typeof type === 'string'	? s.obj[type]
		:	type;
}

//-----------------------------------------------------------------------------
// possibly async versions of read/write
//-----------------------------------------------------------------------------

type get2<T> = ((s: _stream) => T) & ((s: async._stream) => Promise<T>);
type put2<T> = ((s: _stream, v: T) => void) & ((s: async._stream, v: T) => Promise<void>);
export interface TypeT2<T>	{ get: get2<T>; put: put2<T>; }
export type TypeX2<T>	= TypeT2<T> | TypeT<T> | TypeX0<T>;// | async.TypeX0<T>;
export type Type2		= Type | async.Type;

export function read2<T extends TypeReader>(s: _stream, spec: T, obj?: any) : ReadType<T>;
export function read2<T extends async.TypeReader>(s: async._stream, spec: T, obj?: any) : Promise<ReadType<T>>;
export function read2<T extends TypeReader|async.TypeReader>(s: _stream|async._stream, spec: T, obj?: any) : MaybePromise<ReadType<T>>;
export function read2<T extends TypeReader|async.TypeReader>(s: any, spec: T, obj?: any) : MaybePromise<ReadType<T>> {
	if (isReader(spec))
		return after(spec.get(s), value => value);

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

function read_merge2<T extends Type2>(s: _stream|async._stream, specs: T): MaybePromise<void> {
	return Object.entries(specs).reduce((acc: any, [k, v]) =>
		after(acc, () => after(read2(s as any, v as any), value => s.obj[k] = value))
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
		:	typeof type === 'function'	? type(s)
		:	typeof type === 'string'	? s.obj[type]
		:	type;
}
export function writex2<T extends object | number | string>(s: _stream, type: TypeX<T>, value: T) : T;
export function writex2<T extends object | number | string>(s: async._stream, type: async.TypeX<T>, value: T): Promise<T>;
export function writex2<T extends object | number | string>(s: _stream | async._stream, type: TypeX2<T>, value: T): MaybePromise<T>;
export function writex2<T extends object | number | string>(s: any, type: TypeX2<T>, value: T) {
	return isWriter(type)				? after(type.put(s, value), () => value)
		:	typeof type === 'function'	? type(s, value)
		:	typeof type === 'string'	? s.obj[type]
		:	type;
}

//-----------------------------------------------------------------------------
//	non-reading types (don't need async)
//-----------------------------------------------------------------------------

interface TypeT0<T> {
	get(s: _stream|async._stream): T;
	put(s: _stream|async._stream, v: T): void;
}

export function SkipType(len: number): TypeT0<void> {
	return {
		get: s => skip(s, len),
		put: s => skip(s, len)
	};
}

export function AlignType(align: number): TypeT0<void> {
	function alignStream(s: _stream|async._stream) {
		const offset = s.tell() % align;
		if (offset)
			skip(s, align - offset);
	}
	return {
		get: s => alignStream(s),
		put: s => alignStream(s)
	};
}

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
	get: ((s => after(s.view(DataView, 8), dv => utils.getBigInt(dv, 0, 8, !be))) as get2<bigint>),
	put: ((s, v) => after(s.view(DataView, 8), dv => utils.putBigUint(dv, 0, v, 8, !be))) as put2<bigint>,
};};
export const UINT64_LE	= _UINT64(false), UINT64_BE = _UINT64(true), INT64_LE = _INT64(false), INT64_BE = _INT64(true);
export const UINT64		= endian_from_stream(_UINT64), INT64 = endian_from_stream(_INT64);

//computed int
export function UINT<T extends number>(bits: T, be?: boolean): TypeNumber2<T> {
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
	 ) as TypeNumber2<T>;
}

export function INT<T extends number>(bits: T, be?: boolean): TypeNumber2<T> {
	if (bits & 7)
		throw new Error('bits must be multiple of 8');

	return (bits === 8 ? UINT8
		: bits > 56
		? endian((be?: boolean) => ({
			get: ((s => after(s.view(DataView, bits / 8), dv => utils.getBigInt(dv, 0, bits / 8, !be))) as get2<bigint>),
			put: ((s, v) => after(s.view(DataView, bits / 8), dv => utils.putBigUint(dv, 0, v, bits / 8, !be))) as put2<bigint>
		}), be)
		: endian(bits == 16 ? _INT16 : bits == 32 ? _INT32 :
		(be?: boolean) => ({
			get: ((s => after(s.view(DataView, bits / 8), dv => utils.getInt(dv, 0, bits / 8, !be))) as get2<number>),
			put: ((s, v) => after(s.view(DataView, bits / 8), dv => utils.putUint(dv, 0, v, bits / 8, !be))) as put2<number>
		}), be)
	) as TypeNumber2<T>;
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
	return as(UINT(F.bits, be), x => +F.raw(x), y => F(y).raw as any);
}

export function FloatRaw(mbits: number, ebits: number, ebias = (1 << (ebits - 1)) - 1, sbit = true, be?: boolean)	{
	const F = utils.Float(mbits, ebits, ebias, sbit);
	return as(UINT(F.bits, be), x => F.raw(x), y => y.raw as any);
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
			skip(s, i + 1 - 16);
			return t;
		}
		let tn = BigInt(t);
		while ((b = buffer[i]) & 0x80)
			tn |= BigInt(b & 0x7f) << BigInt(i++ * 7);
		tn |= BigInt(b) << BigInt(i * 7);
		skip(s, i + 1 - 16);
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

export function StringType(len: TypeX2<number>, encoding: utils.TextEncoding = 'utf8', zeroTerminated = false, lenScale?: number): TypeT2<string> {
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
				buff => utils.encodeTextInto(v, buff, encoding)
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

export function NullTerminatedStringType(encoding: utils.TextEncoding = 'utf8'): TypeT2<string> {
	return StringType(
		(s, v?: number) => v === undefined ? find0(s, encoding === 'utf8' ? Uint8Array : Uint16Array) : v,
		encoding, true, 1
	);
};

export function RemainingStringType(encoding: utils.TextEncoding = 'utf8', zeroTerminated = false): TypeT2<string> {
	return {
		get: (s => after(remainder(s), r => utils.decodeText(r, encoding))) as get2<string>,
		put: ((s, v) => {
			if (zeroTerminated)
				v += '\0';
			const encoded = utils.encodeText(v, encoding);
			return after(s.view(Uint8Array, encoded.length), buffer => buffer.set(encoded));
		}) as put2<string>,
	};
}

//-----------------------------------------------------------------------------
//	array types
//-----------------------------------------------------------------------------

export function ArrayType<T extends Type2>(len: TypeX2<number>, type: T): TypeT2<ReadType<T>[]> {
	type R = ReadType<T>[];
	return {
		get: ((s => after(readx2(s, len), n => readn2(s, type, n))) as get2<R>) as get2<R>,
		put: ((s, v) => after(writex2(s, len, v.length), () => writen2(s, type, v))) as put2<R>
	};
}

export function RemainingArrayType<T extends Type2>(type: T): TypeT2<ReadType<T>[]> {
	type R = ReadType<T>[];
	return {
		get: (s => {
			const result: R = [];
			const readNext = (): any => {
				//if (!s.remaining())
				//	return result;
				try {
					return after(read2(s, type), value => {
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
	};
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

export const Remainder: TypeT2<Uint8Array> = {
	get:(s => {
		const tell = s.tell();
		const chunk = (nextSize: number): any => after(
			s.view(Uint8Array, nextSize, false),
			data => {
				if (data.length < nextSize)
					return data;
				s.seek(tell);
				return chunk(nextSize * 2);
			}
		);
		return chunk(16);
	}) as get2<Uint8Array>,
	put:((s, v) => after(s.view(Uint8Array, v.length), d => d.set(v))) as put2<Uint8Array>
};

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

export function SizeType<T extends Type2>(len: TypeX2<number>, type: T): TypeT2<ReadType<T>> {
	return {
		get: (s => after(readx2(s, len), size => {
			const start = s.tell();
			return after(read2(offsetStream(s, start, size), type), r => {
				s.seek(start);
				return r;
			});
		})) as get2<ReadType<T>>,
		put: ((s, v) => {
			const offsetPos = s.tell();
			return after(writex2(s, len, 0), () => {
				const start = s.tell();
				return after(write2(offsetStream(s, start), type, v), () => {
					const end = s.tell();
					s.seek(offsetPos);
					return after(writex2(s, len, end - start), () => s.seek(end));
				});
			});
		}) as put2<ReadType<T>>
	};
}

export function OffsetType<T extends Type2>(offset: TypeX2<number>, type: T): TypeT2<ReadType<T>> {
	return {
		get: (s => after(readx2(s, offset), off => {
			const pos = s.tell();
			return after(read2(offsetStream(s, off), type), r => {
				s.seek(pos);
				return r;
			});
		})) as get2<ReadType<T>>,

		put: ((s, v) => {
			const offsetPos = s.tell();
			return after(writex2(s, offset, 0), () => {
				const atend = s.atend;
				s.atend = (s: any) => {
					const start = s.tell();
					return after(write2(offsetStream(s, start), type, v), () => {
						const end = s.tell();
						s.seek(offsetPos);
						return after(writex2(s, offset, start), () => {
							s.seek(end);
							atend?.(s);
						});
					});
				};
			});
		}) as put2<ReadType<T>>
	};
}

export function MaybeOffsetType<T extends Type2>(offset: TypeX2<number>, type: T): TypeT2<ReadType<T> | undefined> {
	return {
		get: (s => after(readx2(s, offset), off => {
			if (off) {
				const pos = s.tell();
				return after(read2(offsetStream(s, off), type), r => {
					s.seek(pos);
					return r;
				});
			}
		})) as get2<ReadType<T> | undefined>,

		put: ((s, v) => {
			if (v === undefined)
				return undefined;
			const offsetPos = s.tell();
			return after(writex2(s, offset, 0), () => {
				const atend = s.atend;
				s.atend = () => {
					const start = s.tell();
					return after(write2(offsetStream(s, start), type, v), () => {
						const end = s.tell();
						s.seek(offsetPos);
						return after(writex2(s, offset, start), () => {
							s.seek(end);
							atend?.(s as any);
						});
					});
				};
			});
		}) as put2<ReadType<T> | undefined>
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

export function Switch<K extends string | number, T extends Record<K, Type2>>(test: TypeX2<K>, switches: T, discriminator = (value: any) => Discriminator(value, switches as any)) {
	type R = ReadType<T[keyof T]>;
	return {
		get: (s => after(readx2(s, test), key => {
			const t = switches[key as keyof T];
			return t && read2(s, t);
		})) as get2<R>,
		put: ((s, v) => {
			if (!isWriter(test))
				return write2(s, switches[getx(s, test) as keyof T], v);
			const t = discriminator(v);
			if (t !== undefined)
				return after(writex2(s, test, t as any), () => write2(s, switches[t as keyof T], v));
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

export function as<T extends Type2, D>(type: T, maker: ClassOrFactory<ReadType<T>, D, _stream|async._stream>, from?: (arg: D) => ReadType<T>) : TypeT2<D> {
	return {
		get: (s => after(read2(s, type), v => make(maker, v, s))) as get2<D>,
		put: ((s, v) => write2(s, type, from ? from(v) : v)) as put2<D>
	};
}

export function withNames<T>(array: T[], func:(v: T, i: number)=>string) : [string, T][] {
	return array.map((v, i) => [func(v, i) ?? `#${i}`, v] as [string, T]);
}

export const field = (field: string) 	=> (v: any) => v[field];
export const names = (names: string[])	=> (v: any, i: number) => names[i];

export function arrayWithNames<T extends Type2>(type: T, func:(v: any, i: number)=>string) {
	return as(type, array => withNames(array, func), v => v.map(([, v]) => v) as ReadType<T>);
}

export function objectWithNames<T extends Type2>(type: T, func:(v: any, i: number)=>string) {
	return as(type, array => Object.fromEntries(withNames(array, func)), v => Object.values(v) as ReadType<T>);
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
