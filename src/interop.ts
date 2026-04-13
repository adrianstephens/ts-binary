import { after, MaybePromise } from './utils';
import { ReadType } from './sync';
import * as sync from './sync';
import * as async from './async';

export type _stream = (sync._stream | async._stream);
export type stream = _stream & {
	read<T extends sync.TypeReader>(spec: T) : MaybePromise<ReadType<T>>;
	write<T extends sync.TypeWriter>(type: T, value: ReadType<T>): MaybePromise<void>;
}

export function stream(s: _stream): stream {
	return s as stream;
}

//-----------------------------------------------------------------------------
// possibly async versions of read/write
//-----------------------------------------------------------------------------

export type get<T> = ((s: sync._stream) => T) & ((s: async._stream) => Promise<T>);
export type put<T> = ((s: sync._stream, v: T) => void) & ((s: async._stream, v: T) => Promise<void>);
export interface TypeT<T>	{ get: get<T>; put: put<T>; }
export type TypeX<T>	= TypeT<T> | sync.TypeT<T> | string | ((s: sync._stream, value?: T)=>T) | T
export type Type		= sync.Type | async.Type;

export function isReader(type: any): type is {get: get<any>} {
	return typeof type.get === 'function';
}
export function isWriter(type: any): type is {put: put<any>} {
	return typeof type.put === 'function';
}


export function read<T extends sync.TypeReader>(s: sync._stream, spec: T, obj?: any) : ReadType<T>;
export function read<T extends async.TypeReader>(s: async._stream, spec: T, obj?: any) : Promise<ReadType<T>>;
export function read<T extends sync.TypeReader|async.TypeReader>(s: sync._stream|async._stream, spec: T, obj?: any) : MaybePromise<ReadType<T>>;
export function read<T extends sync.TypeReader|async.TypeReader>(s: any, spec: T, obj?: any) : MaybePromise<ReadType<T>> {
	if (isReader(spec))
		return spec.get(s);

	if (!obj)
		obj = {obj: s.obj} as any;
	s.obj	= obj;

    return after(Object.entries(spec).reduce((acc: any, [k, t]) => 
        after(acc, () => after(read(s, t), value => obj[k] = value))
    , undefined), () => {
		s.obj	= obj.obj;
		delete obj.obj;
		return obj;
	});
}

export function write(s: sync._stream, type: sync.TypeWriter, value: any) : void;
export function write(s: async._stream, type: async.TypeWriter, value: any) : Promise<void>;
export function write(s: sync._stream|async._stream, type: sync.TypeWriter|async.TypeWriter, value: any) : MaybePromise<void>;
export function write(s: any, type: sync.TypeWriter|async.TypeWriter, value: any) : MaybePromise<void> {
	if (isWriter(type))
		return type.put(s, value);

	if (typeof value === 'object' && value !== null) {
		value.obj = s.obj;
		s.obj = value;
	}
    return after(Object.entries(type).reduce((acc: any, [k, t]) => 
        after(acc, () => write(s, t, value[k]))
    , undefined), () => {
		if (typeof value === 'object' && value !== null) {
			s.obj = value.obj;
			delete value.obj;
		}
	});
}

export function readn<T extends sync.TypeReader>(s: sync._stream, type: T, n: number) : ReadType<T>[];
export function readn<T extends async.TypeReader>(s: async._stream, type: T, n: number) : Promise<ReadType<T>[]>;
export function readn<T extends sync.TypeReader|async.TypeReader>(s: sync._stream|async._stream, type: T, n: number) : MaybePromise<ReadType<T>[]>;
export function readn<T extends sync.TypeReader|async.TypeReader>(s: any, type: T, n: number) : MaybePromise<ReadType<T>[]> {
	const result: ReadType<T>[] = [];
	let acc: any = undefined;
	for (let i = 0; i < n; i++)
		acc = after(acc, () => after(read(s, type), value => result.push(value)));
	return after(acc, () => result);
}

export function writen(s: sync._stream, type: sync.TypeWriter, v: any): void;
export function writen(s: async._stream, type: async.TypeWriter, v: any): Promise<void>;
export function writen(s: sync._stream|async._stream, type: sync.TypeWriter|async.TypeWriter, v: any): MaybePromise<void>;
export function writen(s: any, type: any, v: any) {
    return v.reduce((acc: any, i: any) => 
        after(acc, () => write(s, type, i))
    , undefined);
}

//export function readx<T extends object | number | string | boolean>(s: sync._stream, type: sync.TypeX<T>): T;
//export function readx<T extends object | number | string | boolean>(s: async._stream, type: async.TypeX<T>): Promise<T>;
//export function readx<T extends object | number | string | boolean>(s: sync._stream | async._stream, type: TypeX<T>): MaybePromise<T>;
//export function readx<T extends object | number | string | boolean>(s: any, type: TypeX<T>) {
//	return 	isReader(type)				? type.get(s)
//		:	getx(s, type as any);
//}
//export function writex<T extends object | number | string>(s: sync._stream, type: sync.TypeX<T>, value: T) : T;
//export function writex<T extends object | number | string>(s: async._stream, type: async.TypeX<T>, value: T): Promise<T>;
//export function writex<T extends object | number | string>(s: sync._stream | async._stream, type: TypeX<T>, value: T): MaybePromise<T>;
//export function writex<T extends object | number | string>(s: any, type: TypeX<T>, value: T) {
//	return	isWriter(type)				? after(type.put(s, value), () => value)
//		:	typeof type === 'function'	? type(s, value)
//		:	getx(s, type as any);
//}


interface TypeTX<T, T2>	{
	get: (s: _stream) => MaybePromise<T>;
	put: (s: _stream, v: T2) => MaybePromise<T>;
}

export function makex<T extends object | number | string | boolean>(type: TypeX<T>): TypeTX<T, T>;
export function makex<T extends object | number | string | boolean, T2>(type: TypeX<T>, discriminator: (v2: T2) => T | undefined): TypeTX<T, T2>;
export function makex<T extends object | number | string | boolean, T2>(type: TypeX<T>, discriminator?: (v2: T2) => T | undefined): any {
	if (typeof type === 'function') {
		return {
			get: (s: any) => type(s),
			put: (s: any, v: T) => type(s, v)
		};
	}
	if (typeof type === 'string') {
		return {
			get: (s: any) => s.obj[type],
			put: (s: any) => s.obj[type]
		};
	}

	if (isReader(type))
		return {
			get: (s: any) => type.get(s),
			put: !isWriter(type) || !discriminator
				? (_s: any, v: T) => v
				: (s: any, v: T2) => {
					const t = discriminator(v);
					if (t !== undefined)
						return after(type.put(s as any, t), () => v);
				}
		};

	return {
		get: () => (type as T),
		put: () => (type as T)
	};
}

//-----------------------------------------------------------------------------
//	Class
//-----------------------------------------------------------------------------

export interface WithStaticGet {
	get<X extends abstract new (...args: any) => any>(this: X, s: _stream): Promise<InstanceType<X>>;
}
export interface WithStaticPut {
	put(s: _stream, v: any): Promise<void>;
}
export interface WithWrite {
	write(s: _stream): Promise<void>;
}

export function ReadClass<T extends sync.TypeReader>(spec: T) {
	return class {
		static async get(s: _stream) {
			return new this(await read(s, spec));
		}
		constructor(s: sync._stream | ReadType<T>) {
			if ('tell' in s)
				s = s.read(spec);
			return Object.assign(this, s);
		}
	} as (new(s: sync._stream | ReadType<T>) => ReadType<T>) & WithStaticGet;
}
		
export function Class<T extends sync.Type>(spec: T) {
    return class Class {
		static async get(s: _stream) {
			return new this(await read(s, spec));
		}
		static async put(s: _stream, v: Class) {
			return await write(s, spec, v);
		}
		constructor(s: sync._stream | ReadType<T>) {
			if (s instanceof sync._stream)
				s = s.read(spec);
			return Object.assign(this, s);
		}
		async write(s: _stream) {
			await write(s, spec, this);
		}
    } as (new(s: sync._stream | ReadType<T>) => ReadType<T> & WithWrite) & WithStaticGet & WithStaticPut;
}

export function Extend<B extends (abstract new (...args: any[]) => any) & WithStaticGet & WithStaticPut, T extends sync.Type>(base: B, spec: T) {
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
			if (args[0] instanceof sync._stream) {
				const s: sync._stream = args[0];
				const obj = s.obj;
				this.obj = obj;
				s.read(spec, this);
				delete this.obj;
			}
		}
		async write(s: _stream) 	{
			await super.write?.(s);
			await write(s, spec, this);
		}
	};

	type BaseData = B extends new (data: infer D) => any ? D : never;
	return Class as unknown as (new(s: sync._stream | (BaseData & ReadType<T>)) => InstanceType<B> & ReadType<T> & WithWrite) & WithStaticGet & WithStaticPut;
}
