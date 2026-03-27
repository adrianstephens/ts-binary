// (Removed invalid export and debug/test types that referenced missing types)
import { TypedArray, TypedArrayLike, ViewMaker, NoPromise, UnionToIntersection } from './utils';

//-----------------------------------------------------------------------------
//	stream
//-----------------------------------------------------------------------------

export type viewDelegate = <T extends TypedArrayLike>(type: ViewMaker<T>, offset: number, len: number) => T;

export class _stream {
	readonly kind = 'sync' as const;
	atend?: (s: _stream) => void;

	protected offset0;

	constructor(
		private viewDelegate: viewDelegate,
		protected offset = 0,
		protected end?: number,
		public be?: boolean,
		public obj?: any
	) {
		this.offset0 = offset;
	}

	// Always merge resolved value types for each field, never raw readers/writers
protected view_absolute<T extends TypedArrayLike>(type: ViewMaker<T>, offset: number, len: number): T {
	return this.viewDelegate(type, offset, len);
}
	get masterOffset()	{ return this.offset0; }
	tell() {
		return this.offset - this.offset0;
	}
	seek(offset: number) {
		this.offset = offset + this.offset0;
	}
	skip(len: number) {
		this.offset += len;
	}
	align(align: number) {
		const misalign = this.tell() % align;
		if (misalign)
			this.skip(align - misalign);
	}
	remaining() {
		return this.end === undefined ? undefined : this.end - this.tell();
	}

	view<T extends TypedArrayLike>(type: ViewMaker<T>, len: number, strict = true): T {
		const bytesPerElement = type.BYTES_PER_ELEMENT || 1;
		const byteLength = len * bytesPerElement;
		
		if (this.end !== undefined && byteLength > this.end - this.tell())
			len = Math.floor((this.end - this.tell()) / bytesPerElement);

		const result = this.view_absolute(type, this.offset, len);
		if (strict && result.byteLength < byteLength)
			throw new Error('stream: out of bounds');
		this.offset += result.byteLength;
		return result;
	}

	offsetStream(offset: number, size?: number) {
		if (size === undefined && this.end !== undefined)
			size = this.end - offset;
		return new _stream(this.viewDelegate, this.offset0 + offset, size, this.be, this.obj);
	}
	subStream<T extends _stream>(type: new (...args: any[]) => T, offset?: number, size?: number) {
		if (offset === undefined)
			offset = this.tell();
		if (size === undefined && this.end !== undefined)
			size = this.end - offset;
		return new type(this.viewDelegate, this.offset0 + offset, size, this.be, this.obj);
	}

	
	remainder() {
		const remaining = this.end !== undefined ? this.end - this.tell() : 0;
		return this.view(Uint8Array, remaining, false);
	}
	write_view<T extends TypedArray>(buf: T) {
		this.view(Uint8Array, buf.length).set(buf);
	}
	view_at<T extends TypedArrayLike>(type: ViewMaker<T>, offset: number, len?: number) {
		return this.view_absolute(type, this.offset0 + offset, len ?? (this.end !== undefined ? this.end - offset : 0));
	}
	peek(len: number) {
		return this.view_at(Uint8Array, this.tell(), len);
	}
	read<T extends TypeReader>(spec: T) { return read(this, spec); }
	write<T extends TypeWriter>(type: T, value: ReadType<T>) { return write(this, type, value); }

	[Symbol.dispose]() {
		const atend = this.atend;
		if (atend) {
			this.atend = undefined;
			atend(this);
		}
	}
}

export class stream extends _stream {
	constructor(buffer: Uint8Array, be?: boolean) {
		const b = buffer.buffer;
		super((type, offset, len) => new type(b, offset, len), buffer.byteOffset, buffer.byteLength, be);
	}
}

export class growingStream extends _stream {
	buffer = new ArrayBuffer(1024);

	constructor() {
		super((type, offset, len) => {
			const needed = offset + len * (type.BYTES_PER_ELEMENT ?? 1);
			if (needed > this.buffer.byteLength) {
				const newBuf = new ArrayBuffer(Math.max(this.buffer.byteLength * 2, needed));
				new Uint8Array(newBuf).set(new Uint8Array(this.buffer));
				this.buffer = newBuf;
				//this.end	= this.buffer.byteLength;
			}
			return new type(this.buffer, offset, len);
		});
    }

	terminate() {
		const atend = this.atend;
		if (atend) {
			this.atend = undefined;
			atend(this);
		}
		return new Uint8Array(this.buffer, 0, this.offset);
	}
}

export class dummyStream extends _stream {
	constructor() {
		let buffer = new ArrayBuffer(1024);
		super((type, offset, len) => {
			const needed = offset + len * (type.BYTES_PER_ELEMENT ?? 1);
			if (needed > buffer.byteLength)
				buffer = new ArrayBuffer(Math.max(buffer.byteLength * 2, needed));

			return new type(buffer, 0, len);
		});
	}
}

export function measure<T extends Type>(type: T, data?: ReadType<T>) {
	const dummy = new dummyStream;
	if (data !== undefined)
		dummy.write(type, data);
	else
		dummy.read(type);
		return dummy.tell();
	}

export interface TypeReaderT<T> { get(s: _stream): T }
export interface TypeWriterT<T> { put(s: _stream, v: T): void }
export type TypeT<T>	= TypeReaderT<T> & TypeWriterT<T>;

export type TypeReader	= TypeReaderT<any> | { [key: string]: TypeReader; } | readonly TypeReaderT<any>[]
export type TypeWriter	= TypeWriterT<any> | { [key: string]: TypeWriter; } | readonly TypeWriterT<any>[]
export type Type 		= TypeT<any> | { [key: string]: Type; } | readonly TypeT<any>[]

export interface MergeBase<T> { merge: T; }
export interface MergeType<T> extends MergeBase<T> { readonly correlated: false; }
export interface CorrelatedMerge<T> extends MergeBase<T> { readonly correlated: true; }

type TupleReadType<T extends readonly unknown[]> = T extends readonly [infer First, ...infer Rest]
	? [ReadType<First>, ...TupleReadType<Rest>]
	: [];


type AllCorrelated<T>	= {[K in keyof T]: T[K] extends { get: (...args: any) => infer R } ? (NoPromise<R> extends CorrelatedMerge<infer U> ? U : never) : never}[keyof T];
type AllMerged<T>		= {[K in keyof T]: T[K] extends { get: (...args: any) => infer R } ? (NoPromise<R> extends MergeType<infer U> ? U : never) : never }[keyof T];

//type UnionProp<T, K extends PropertyKey> = T extends any ? (K extends keyof T ? T[K] : never) : never;

type FixIntersection3<T, I> = {
	[K in keyof I]: I[K] extends never ? (T extends any ? (K extends keyof T ? (T[K] extends undefined ? T[K] : Exclude<T[K], undefined>) : I[K]) : I[K]) : I[K];
//	[K in keyof I]: I[K] extends never ? (UnionProp<T, K> extends undefined ? UnionProp<T, K> : Exclude<UnionProp<T, K>, undefined>) : I[K];
//	[K in keyof I]: I[K] extends never ? T[K as keyof T] : I[K];
//	[K in keyof T]: K extends keyof I ? I[K] extends never ? T[K] : I[K] : T[K];
//	[K in keyof I]: I[K] extends never ? (T & { [P in K]: unknown })[K] : I[K];
//	[K in keyof I]: I[K] extends never ? UnionProp<T, K> : I[K];
};

type FixIntersection<T> = FixIntersection3<T, UnionToIntersection<T>>;

export type ReadType<T> = T extends {new (s: infer _S extends _stream): infer R} ? R
	: T extends { get: (s: any) => infer R } ? NoPromise<R>
	: T extends readonly unknown[] ? TupleReadType<T>
	: T extends object ? (
		[AllMerged<T>] extends [never] ?
			{ [K in keyof T as
				T[K] extends { new (...args: any): any } ? K
				: T[K] extends { get: (...args: any) => infer R } ? NoPromise<R> extends undefined ? never : NoPromise<R> extends MergeBase<any> ? never : K
				: K
			]: ReadType<T[K]> }
		: FixIntersection<Exclude<		
			{ [K in keyof T as
				T[K] extends { new (...args: any): any } ? K
				: T[K] extends { get: (...args: any) => infer R } ? NoPromise<R> extends undefined ? never : NoPromise<R> extends MergeBase<any> ? never : K
				: K
			]: ReadType<T[K]> }
			| AllMerged<T>,
			never>>
		) & ([AllCorrelated<T>] extends [never] ? unknown : AllCorrelated<T>)
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

export function isReader(type: any): type is TypeReaderT<any> {
	return typeof type.get === 'function';
}
export function isWriter(type: any): type is TypeWriterT<any> {
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
		:	getx(s, type);
}
export function writex<T extends object | number | string>(s: _stream, type: TypeX<T>, value: T) {
	return isWriter(type)				? (type.put(s, value), value)
		:	typeof type === 'function'	? type(s, value)
		:	getx(s, type);
}

export function getx<T extends object | number | string | boolean>(s: any, type: TypeX0<T>): T {
	return typeof type === 'function'	? type(s)
		:	typeof type === 'string'	? s.obj[type]
		:	type;
}
