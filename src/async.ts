import type { ReadType } from './sync';
import { after, MaybePromise, ViewMaker, TypedArray, TypedArrayLike } from './utils';

//-----------------------------------------------------------------------------
//	stream
//-----------------------------------------------------------------------------

export class _stream {
	readonly kind = 'async' as const;
	atend?: (s: _stream) => Promise<void>;

	protected offset0;

	constructor(
        private viewDelegate: <T>(type: ViewMaker<T>, offset: number, len: number) => MaybePromise<T>,
		protected offset = 0,
		protected end?: number,
        public be?: boolean,
        public obj?: any
	) {
		this.offset0 = offset;
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

	view<T extends TypedArrayLike>(type: ViewMaker<T>, len: number, strict = true): MaybePromise<T> {
		const bytesPerElement = type.BYTES_PER_ELEMENT || 1;
		const byteLength = len * bytesPerElement;

		if (this.end && byteLength > this.end - this.tell()) {
			if (strict)
				return Promise.reject(new Error('stream: out of bounds'));
			len = Math.floor((this.end - this.tell()) / bytesPerElement);
		}

		const result = this.viewDelegate(type, this.offset, len);
		this.offset += byteLength;
		return result;
	}

	offsetStream(offset: number, size?: number) {
		if (size === undefined && this.end !== undefined)
			size = this.end - offset;
		return new _stream(this.viewDelegate, this.offset0 + offset, size, this.be, this.obj);
	}
	
	async remainder() {
		const tell = this.tell();
		for (let size = 16;; size <<= 1) {
			const data = await this.view(Uint8Array, size, false);
			if (data.length < size)
				return data;
			this.seek(tell);
		}
	}
	async write_view<T extends TypedArray>(buf: T) {
		(await this.view(Uint8Array, buf.length)).set(buf);
	}
	view_at<T extends TypedArrayLike>(type: ViewMaker<T>, offset: number, len?: number) {
		return this.viewDelegate(type, this.offset0 + offset, len ?? (this.end !== undefined ? this.end - offset : 0));
	}
	async peek(len: number) {
		return this.view_at(Uint8Array, this.tell(), len);
	}
	read<T extends TypeReader>(spec: T) { return read(this, spec); }
	write<T extends TypeWriter>(type: T, value: ReadType<T>) { return write(this, type, value); }
}

export class stream extends _stream {
	constructor(
		readAt:		(offset: number, data: Uint8Array) => Promise<number>,
		writeAt?:	(offset: number, data: Uint8Array) => Promise<void>,
		atend?:		(s: _stream) => Promise<void>,
		end?:		number
	) {

		let buffer		= new ArrayBuffer(1024);
		let buff_at		= 0;	// offset of start of buffer from start of file
		let buff_size	= 0;	// size of buffer in bytes
		let flush_begin	= 0;	// start of flush range
		let flush_end	= 0;	// end of flush range

		const flush = () => {
			if (writeAt && flush_end > flush_begin)
				return writeAt(buff_at + flush_begin, new Uint8Array(buffer, flush_begin, flush_end - flush_begin));
		};

		const expand = async (offset: number, byteLength: number) => {
			let buff_offset		= offset - buff_at;
			while (buff_offset < 0 || buff_offset + byteLength > buff_size) {
				const remaining = buff_size - buff_offset;
				await flush();
				flush_begin = flush_end = 0;

				if (buff_offset < 0 || remaining < 0) {
					if (buffer.byteLength < byteLength || (byteLength <= 1024 && buffer.byteLength > 1024))
						buffer = new ArrayBuffer(byteLength <= 1024 ? 1024 : byteLength * 2);

					buff_at		= offset;
					buff_size	= buffer.byteLength;
					//const _read	= 
					await readAt(offset, new Uint8Array(buffer));

				} else {
					const newbuff 	= new ArrayBuffer(byteLength <= 1024 ? 1024 : byteLength * 2);
					new Uint8Array(newbuff).set(new Uint8Array(buffer, buff_offset, remaining), 0);
					buffer		= newbuff;

					buff_at		= offset;
					buff_size 	= buffer.byteLength;
					//const _read	= 
					await readAt(offset + remaining, new Uint8Array(buffer, remaining));
				}
				buff_offset		= offset - buff_at;
			}

			flush_end		= Math.max(flush_end, buff_offset + byteLength);
			return buff_offset;
		};

		super((type, offset, len) => {
			const byteLength	= len * (type.BYTES_PER_ELEMENT || 1);
			const buff_offset	= offset - buff_at;

			if (buff_offset >= 0 && buff_offset + byteLength <= buff_size) {
				flush_end = Math.max(flush_end, buff_offset + byteLength);
				return new type(buffer, buff_offset, len);
			}

			return expand(offset, byteLength).then(buff_offset => new type(buffer, buff_offset, len));

		}, 0, end);

		this.atend = (async (s: _stream) => {
			await flush();
			await atend?.(s);
		});
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

export type TypeReader	= TypeReaderT<any> | { [key: string]: TypeReader; } | readonly TypeReaderT<any>[]
export type TypeWriter	= TypeWriterT<any> | { [key: string]: TypeWriter; } | readonly TypeWriterT<any>[]
export type Type 		= TypeT<any> | { [key: string]: Type; } | readonly TypeT<any>[]

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
