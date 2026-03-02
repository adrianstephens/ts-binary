import type { ViewLike, View, ReadType } from './binary';

export interface _stream {
	be?: boolean;							// read numbers as bigendian/littleendian
	obj?: any;								// current object being read
	remaining(): number;					// number of remaining bytes
	remainder(): Promise<Uint8Array>;		// buffer of remaining bytes
	tell(): number;							// current offset from start of file
	seek(offset: number): void;				// set current offset from start of file
	skip(offset: number): void;				// move current offset from start of file
	read_buffer(len: number): Promise<Uint8Array>;
	write_buffer(value: Uint8Array): Promise<void>;
	view<T extends ViewLike>(type: View<T>, len: number): Promise<T>;
}

export interface TypeReaderT<T> { get(s: _stream): Promise<T> }
export interface TypeWriterT<T> { put(s: _stream, v: T): Promise<void> }
export type TypeT<T>	= TypeReaderT<T> & TypeWriterT<T>;
export type TypeX<T>	= TypeT<T> | ((s: _stream)=>Promise<T>) | ((s: _stream)=>T) | T;

export type TypeReader	= TypeReaderT<any> | { [key: string]: TypeReader; } | TypeReaderT<any>[]
export type TypeWriter	= TypeWriterT<any> | { [key: string]: TypeWriter; } | TypeWriterT<any>[]
export type Type 		= TypeT<any> | { [key: string]: Type; } | TypeT<any>[]

export function ReadClass<T extends TypeReader>(spec: T) {
	return class {
		static async get(s: _stream) {
			return new this(await read(s, spec));
		}
		constructor(data: ReadType<T>) {
			return Object.assign(this, data);
		}
	} as (new(data: ReadType<T>) => ReadType<T>) & {
		get:<X extends abstract new (...args: any) => any>(this: X, s: _stream) => Promise<InstanceType<X>>,
	};
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
		write(s: _stream) 	{
			write(s, spec, this);
		}
    } as (new(data: ReadType<T>) => ReadType<T> & { write(w: _stream): void }) & {
		get:<X extends abstract new (...args: any) => any>(this: X, s: _stream) => InstanceType<X>,
		put:<X extends abstract new (...args: any) => any>(this: X, s: _stream, v: InstanceType<X>) => Promise<void>
	};
}

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
		acc.then(read(s, t).then(value => obj[k] = value))
	, undefined);

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
	, undefined);
}

export async function readx<T extends object | number | string | boolean>(s: _stream, type: TypeX<T>): Promise<T> {
	return typeof type === 'function'	? type(s)
		:	isReader(type)				? type.get(s)
		:	type;
}
export async function writex<T extends object | number | string>(s: _stream, type: TypeX<T>, value: T): Promise<T> {
	return typeof type === 'function'	? type(s)
		:	isWriter(type)				? type.put(s, value).then(() => value)
		:	type;
}
