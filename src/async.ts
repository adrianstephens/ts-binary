import type { ReadType } from './binary';
import { after, MaybePromise, ViewMaker } from './utils';

export interface _stream {
	be?:			boolean;				// read numbers as bigendian/littleendian
	obj?:			any;					// current object being read
	atend?:			(s: _stream) => void;	// callback for when stream finished
	remaining():	number;					// number of remaining bytes
	remainder():	Promise<Uint8Array>;	// buffer of remaining bytes
	tell():			number;					// current offset from start of file
	seek(offset: number): void;				// set current offset from start of file
	view<T>(type: ViewMaker<T>, len: number, strict?: boolean): Promise<T>;
}

export class stream implements _stream {
	be?:	boolean;
	obj?:	any;
	atend?: (s: _stream) => Promise<void>;

	buffer		= new ArrayBuffer(1024);
	offset		= 0;	// current offset from start of file
	end			= 0;	// end of file

	buff_at		= 0;	// offset of start of buffer from start of file
	buff_size	= 0;	// size of buffer in bytes
	flush_begin	= 0;	// start of flush range
	flush_end	= 0;	// end of flush range

	constructor(
		public readAt:	(offset: number, data: Uint8Array) => Promise<number>,
		public writeAt?:(offset: number, data: Uint8Array) => Promise<void>,
		atend?:	(s: _stream) => Promise<void>
	) {
		this.atend = (async (s: stream) => { await s.flush(); await atend?.(s); }) as any;
	}
	async checksize(len: number, useRead: boolean) {
		const buff_offset = this.offset - this.buff_at;

		if (buff_offset < 0 || buff_offset >= this.buff_size) {
			this.flush();

			if (this.buffer.byteLength < len || (len <= 1024 && this.buffer.byteLength > 1024))
				this.buffer = new ArrayBuffer(len <= 1024 ? 1024 : len * 2);

			this.buff_at	= this.offset;
			const read		= await this.readAt(this.offset, new Uint8Array(this.buffer));
			this.buff_size	= useRead ? read : this.buffer.byteLength;
			this.end		= this.buff_at + this.buff_size;

			this.flush_begin = this.flush_end	= 0;

		} else if (buff_offset + len > this.buff_size) {
			this.flush();

			const remaining = this.buff_size - buff_offset;
			const buffer 	= new ArrayBuffer(len <= 1024 ? 1024 : len * 2);
			new Uint8Array(buffer).set(new Uint8Array(this.buffer, buff_offset, remaining), 0);
			this.buffer		= buffer;

			this.buff_at	= this.offset;
			const read		= await this.readAt(this.offset + remaining, new Uint8Array(buffer, remaining));
			this.buff_size 	= useRead ? remaining + read : buffer.byteLength;
			this.end		= this.buff_at + this.buff_size;

			this.flush_begin = remaining;
			this.flush_end	= 0;
		}
	}
	remaining() {
		return this.end - this.offset;
	}
	tell() {
		return this.offset;
	}
	seek(offset: number) {
		this.offset = offset;
	}
	async remainder() {
		for (let size = 16;; size *= 2) {
			await this.checksize(size, true);
			if (this.remaining() < size)
				return new Uint8Array(this.buffer, this.offset - this.buff_at, this.remaining());
		}
	}
	async view<T>(type: ViewMaker<T>, len: number, strict = true): Promise<T> {
		const byteLength = len * (type.BYTES_PER_ELEMENT ?? 1);
		await this.checksize(byteLength, false);
		const buff_offset = this.offset - this.buff_at;
		this.offset += byteLength;
		this.flush_end = Math.max(this.flush_end, this.offset - this.buff_at);
		return new type(this.buffer, buff_offset, len);
	}

	async flush() {
		if (this.writeAt && this.flush_end > this.flush_begin)
			return this.writeAt(this.buff_at + this.flush_begin, new Uint8Array(this.buffer, this.flush_begin, this.flush_end - this.flush_begin));
	}
	async terminate() {
		await this.atend?.(this);
	}
}

//-----------------------------------------------------------------------------
//	Types
//-----------------------------------------------------------------------------

export interface TypeReaderT<T> { get(s: _stream): MaybePromise<T> }
export interface TypeWriterT<T> { put(s: _stream, v: T): MaybePromise<void> }
export type TypeT<T>	= TypeReaderT<T> & TypeWriterT<T>;
export type TypeX0<T>	= ((s: _stream, value?: T)=>MaybePromise<T>) | T
export type TypeX<T>	= TypeT<T> | TypeX0<T>;

export type TypeReader	= TypeReaderT<any> | { [key: string]: TypeReader; } | TypeReaderT<any>[]
export type TypeWriter	= TypeWriterT<any> | { [key: string]: TypeWriter; } | TypeWriterT<any>[]
export type Type 		= TypeT<any> | { [key: string]: Type; } | TypeT<any>[]

export interface WithStaticGet {
	get:<X extends abstract new (...args: any) => any>(this: X, s: _stream) => Promise<InstanceType<X>>
}
export interface WithStaticPut {
	put:(s: _stream, v: any) => Promise<void>
}
export interface WithWrite {
	write:(s: _stream) => Promise<void>
}

export function ReadClass<T extends TypeReader>(spec: T) {
	return class {
		static async get(s: _stream) {
			return new this(await read(s, spec));
		}
		constructor(data: ReadType<T>) {
			return Object.assign(this, data);
		}
	} as (new(data: ReadType<T>) => ReadType<T>) & WithStaticGet;
}
	
export function Class<T extends Type>(spec: T) {
    return class Class {
		static async get(s: _stream) {
			return new this(await read(s, spec));
		}
		static async put(s: _stream, v: Class) {
			return await write(s, spec, v);
		}
        constructor(data: ReadType<T>) {
            Object.assign(this, data);
        }
		async write(s: _stream) {
			await write(s, spec, this);
		}
    } as (new(data: ReadType<T>) => ReadType<T> & WithWrite) & WithStaticGet & WithStaticPut;
}

export function Extend<B extends (abstract new (...args: any[]) => any) & WithStaticGet & WithStaticPut, T extends Type>(base: B, spec: T) {
	abstract class Class extends base {
		static async get(s: _stream): Promise<InstanceType<B> & ReadType<T>> {
			const b = await base.get(s);
			b.obj = s.obj;
			await read(s, spec, b);
			delete b.obj;
			return new (this as any)(b);
		}
		static async put(s: _stream, v: Class) {
			await base.put(s, v);
			await write(s, spec, v);
		}
		constructor(...args: any[]) {
			super(...args);
		}
		async write(s: _stream) 	{
			await super.write?.(s);
			await write(s, spec, this);
		}
	};

	type BaseData = B extends new (data: infer D) => any ? D : never;
	return Class as unknown as (new(data: BaseData & ReadType<T>) => InstanceType<B> & ReadType<T> & WithWrite) & WithStaticGet & WithStaticPut;
}

//-----------------------------------------------------------------------------
// asynchronous versions of read/write
//-----------------------------------------------------------------------------

function isReader(type: any): type is TypeReaderT<any> {
	return typeof type.get === 'function';
}
function isWriter(type: any): type is TypeWriterT<any> {
	return typeof type.put === 'function';
}

export async function read<T extends TypeReader>(s: _stream, spec: T, obj?: any) : Promise<ReadType<T>> {
	if (isReader(spec))
		return spec.get(s);

	if (!obj)
		obj = {obj: s.obj} as any;
	s.obj	= obj;

	await Object.entries(spec).reduce((acc: any, [k, t]) => 
		acc.then(() => read(s, t).then(value => obj[k] = value))
	, Promise.resolve());

	s.obj	= obj.obj;
	delete obj.obj;
	return obj;
}

export async function write(s: _stream, type: TypeWriter, value: any) : Promise<void> {
	if (isWriter(type)) {
		await type.put(s, value);
		return;
	}
	s.obj = value;

	await Object.entries(type).reduce((acc: any, [k, t]) => 
		acc.then(() => write(s, t, value[k]))
	, Promise.resolve());
}

export async function readx<T extends object | number | string | boolean>(s: _stream, type: TypeX<T>): Promise<T> {
	return typeof type === 'function'	? type(s)
		:	isReader(type)				? type.get(s)
		:	type;
}
export async function writex<T extends object | number | string>(s: _stream, type: TypeX<T>, value: T): Promise<T> {
	return typeof type === 'function'	? type(s, value)
		:	isWriter(type)				? after(type.put(s, value), () => value)
		:	type;
}
