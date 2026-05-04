import { ReadType, merge } from './common';
import { TypedArray, ViewMaker, ViewInstance } from './utils';

//-----------------------------------------------------------------------------
//	stream
//-----------------------------------------------------------------------------

export type viewDelegate = <V extends ViewMaker<any>>(type: V, offset: number, len: number) => ViewInstance<V>;

export class _stream {
	readonly kind = 'sync' as const;
	atend?: (s: _stream) => void;

	protected readonly offset0;

	constructor(
		private viewDelegate: viewDelegate,
		protected offset = 0,
		protected end?: number,
		public be?: boolean,
		public obj?: any
	) {
		this.offset0 = offset;
	}

	protected view_absolute<V extends ViewMaker<any>>(type: V, offset: number, len: number) {
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

	view<V extends ViewMaker<any>>(type: V, len: number, strict = true) {
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
	view_at<V extends ViewMaker<any>>(type: V, offset: number, len?: number) {
		return this.view_absolute(type, this.offset0 + offset, len ?? (this.end !== undefined ? this.end - offset : 0));
	}
	peek(len: number) {
		return this.view_at(Uint8Array, this.tell(), len);
	}
	read<T extends TypeReader, U extends object>(spec: T, obj: U): ReadType<T> & U;
	read<T extends TypeReader>(spec: T): ReadType<T>;
	read<T extends TypeReader>(spec: T, obj?: any) {
		if (obj) {
			this.obj = obj;
			read_merge(this, spec);
			return obj;
		}
		return read(this, spec);
	}
	write<T extends TypeWriter>(type: T, value: ReadType<T>)	{ return write(this, type, value); }

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

//-----------------------------------------------------------------------------
// synchronous versions of read/write
//-----------------------------------------------------------------------------

export function isReader(type: any): type is TypeReaderT<any> {
	return typeof type.get === 'function';
}
export function isWriter(type: any): type is TypeWriterT<any> {
	return typeof type.put === 'function';
}

export function read<T extends TypeReader>(s: _stream, spec: T) : ReadType<T> {
	if (isReader(spec))
		return spec.get(s);

	const	obj = {obj: s.obj} as any;
	s.obj	= obj;
	Object.entries(spec).forEach(([k, t]) => obj[k] = read(s, t));
	s.obj	= obj.obj;
	delete obj.obj;
	return obj;
}

function read_merge<T extends TypeReader>(s: _stream, specs: T) {
	if (isReader(specs)) {
		const value = specs.get(s);
		Object.assign(s.obj, value);
		if (value?.constructor)
			Object.setPrototypeOf(s.obj, value.constructor.prototype);

	} else {
		for (const [k, v] of Object.entries(specs))
			merge(s.obj, k, read(s, v));
	}
}

export function write(s: _stream, type: TypeWriter, value: any) : void {
	if (isWriter(type)) {
		type.put(s, value);
		return;
	}

	if (typeof value === 'object' && value !== null) {
		value.obj = s.obj;
		s.obj = value;
	}
	Object.entries(type).map(([k, t]) => write(s, t, value[k]));

	if (typeof value === 'object' && value !== null) {
		s.obj = value.obj;
		delete value.obj;
	}
}

export function readn<T extends TypeReader>(s: _stream, type: T, n: number) : ReadType<T>[] {
	const result: ReadType<T>[] = [];
	(result as any).obj = s.obj;
	s.obj = result;
	for (let i = 0; i < n; i++)
		result.push(read(s, type));
	s.obj = (result as any).obj;
	delete (result as any).obj;
	return result;
}

export function writen(s: _stream, type: any, v: any) {
	for (const i of v)
		write(s, type, i);
}

//-----------------------------------------------------------------------------
//	Class
//-----------------------------------------------------------------------------
/*
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
		constructor(s: _stream | ReadType<T>) {
			if (s instanceof _stream)
				s = s.read(spec);
			return Object.assign(this, s);
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
			if (s instanceof _stream)
				s = s.read(spec);
			return Object.assign(this, s);
		}
		write(s: _stream) 	{
			write(s, spec, this);
		}
	} as (new(s: _stream | ReadType<T>) => ReadType<T> & { write(w: _stream): void }) & WithStaticGet & WithStaticPut;
}

export function Extend<B extends (abstract new (...args: any[]) => any) & WithStaticGet & WithStaticPut, T extends Type>(base: B, spec: T) {
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
			if (args[0] instanceof _stream) {
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
*/