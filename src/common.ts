
//-----------------------------------------------------------------------------
//	Decompression
//-----------------------------------------------------------------------------

export type Codec = (buffer: Uint8Array) => Promise<Uint8Array>;
const compressors: Record<string, Codec> = {};
const decompressors: Record<string, Codec> = {};

async function transformWithStream(Ctor: any, format: string, buffer: Uint8Array) {
	const stream = new Ctor(format);
	const writer = stream.writable.getWriter();
	writer.write(buffer);
	writer.close();
	return new Uint8Array(await new (globalThis as any).Response(stream.readable).arrayBuffer());
}

const supportedCodecs = ['brotli', 'deflate', 'deflate-raw', 'gzip', 'zstd'];

function tryAutoConfigureCodec(name: string, ctor: any): Codec {
	if (ctor && supportedCodecs.includes(name))
		return buffer => transformWithStream(ctor, name, buffer);
	return () => { throw new Error(`Decompression for ${name} is not configured for this environment`); };
}

export function configureCompression(name: string, codec: Codec) {
	compressors[name] = codec;
}
export function configureDecompression(name: string, codec: Codec) {
	decompressors[name] = codec;
}
export function decompress(name: string): Codec {
	return decompressors[name] ??= tryAutoConfigureCodec(name, (globalThis as any).DecompressionStream);
}
export function compress(name: string): Codec {
	return compressors[name] ??= tryAutoConfigureCodec(name, (globalThis as any).CompressionStream);
}

//-----------------------------------------------------------------------------
//	after
//-----------------------------------------------------------------------------

export function after<V, R>(v: V, then: (value: Awaited<V>) => R): V extends Promise<any> ? Promise<Awaited<R>> : R {
	if (!(v instanceof Promise))
		return then(v as Awaited<V>) as any;

	return v.then(then) as any;
}

export function tryAfter<V, R>(initial: () => V, then: (value: Awaited<V>) => R, catchFn: (error: any) => R): V extends PromiseLike<any> ? Promise<Awaited<R>> : R {
	let v: V;
	try {
		v = initial();
	} catch (e) {
		return catchFn(e) as any;
	}

	if (v instanceof Promise)
		return v.then(then).catch(catchFn) as any;

	try {
		const result = then(v as Awaited<V>);
		return (result instanceof Promise ? result.catch(catchFn) : result) as any;
	} catch (e) {
		return catchFn(e) as any;
	}
}

class Chain<T> {
	constructor(public value: T) {}
	then<R>(fn: (v: Awaited<T>) => R) {
		return new Chain(after(this.value, fn));
	}
}

export function chain<T>(v: T) {
    return new Chain(v);
}

export function merge(obj: any, k: string, value: any) {
	if (value !== undefined) {
		const current = obj[k];
		if (current && typeof value === 'object' && typeof current === 'object' && value.constructor === Object && current.constructor === Object)
			Object.assign(current, value);
		else
			obj[k] = value;
	}
}

//-----------------------------------------------------------------------------
//	stream
//-----------------------------------------------------------------------------

interface _stream {
	obj?:	any;
	tell(): number;
	seek(offset: number): void;
}

export function pushObj(s: _stream, obj: any) {
	obj.obj = s.obj;
	s.obj = obj;
}
export function popObj<T extends object>(s: _stream, obj: T = s.obj) {
	s.obj = (obj as any).obj;
	delete (obj as any).obj;
	return obj;
}

//-----------------------------------------------------------------------------
//	types
//-----------------------------------------------------------------------------

export type UnionToIntersection<U> = (U extends any ? (x: U) => void : never) extends (x: infer I) => void ? I : never;
export type NoPromise<T> = T extends PromiseLike<infer R> ? R : T;
export type MaybePromise<T> = T | Promise<T>;
export type MaybePromise2<T, A extends boolean> = A extends true ? Promise<T> : T;

export interface MergeBase<T> { merge: T; }
export interface MergeType<T> extends MergeBase<T> { readonly correlated: false; }
export interface CorrelatedMerge<T> extends MergeBase<T> { readonly correlated: true; }

type TupleReadType<T extends readonly unknown[]> = T extends readonly [infer First, ...infer Rest]
	? [ReadType<First>, ...TupleReadType<Rest>]
	: [];


type StripMerge<T>		= T extends MergeBase<infer U> ? StripMerge<U> : T;
type MergedInner<T>		= T extends MergeType<infer U> ? U : never;
type CorrelatedInner<T> = T extends MergeType<infer U> ? CorrelatedInner<U> : T extends CorrelatedMerge<infer U> ? U : never;
type AllMerged<T>		= Exclude<{ [K in keyof T]: T[K] extends { get: (...args: any) => infer R }	? MergedInner<NoPromise<R>> : never}[keyof T], never>;
type AllCorrelated<T>	= Exclude<{ [K in keyof T]: T[K] extends { get: (...args: any) => infer R } ? CorrelatedInner<NoPromise<R>> : never}[keyof T], never>;

type NonMerged<T> = T extends any ? {[K in keyof T as
	T[K] extends { new (...args: any): any } ? K
	: T[K] extends { get: (...args: any) => infer R } ? NoPromise<R> extends undefined ? never : NoPromise<R> extends MergeBase<any> ? never : K
	: K
]: ReadType<T[K]> } : never;


type AllKeys<T> = T extends any ? keyof T : never;
type FieldType<T, K extends PropertyKey> = T extends any ? K extends keyof T ? T[K] : never : never;
type OptionalKeys<T> = { [K in AllKeys<T>]: T extends any ? K extends keyof T ? never : K : never }[AllKeys<T>];
type MergeObject<T> = [T] extends [CorrelatedMerge<any>] ? StripMerge<T>
	: [T] extends [UnionToIntersection<T>]	? T
	: { [K in Exclude<AllKeys<T>, OptionalKeys<T>>]: FieldType<T, K> } & { [K in OptionalKeys<T>]?: FieldType<T, K> };

type MergeOverlap<A, B> = [A] extends [never]	? Exclude<B, undefined>
	: [Exclude<B, undefined>] extends [A]		? Exclude<B, undefined>
	: [A] extends [Exclude<B, undefined>]		? Exclude<B, undefined>
	: A | Exclude<B, undefined>;

type MergeResult<A, B> = {[K in keyof A]: K extends keyof B ? MergeOverlap<A[K], B[K]> : A[K]}
	& {[K in Exclude<keyof B, keyof A> as undefined extends B[K] ? K : never]?: B[K]}
	& {[K in Exclude<keyof B, keyof A> as undefined extends B[K] ? never : K]: B[K]};

export type ReadType<T> = T extends {new (s: infer _S extends _stream): infer R} ? R
	: T extends { get: (s: any) => infer R } ? NoPromise<R>
	: T extends readonly unknown[] ? TupleReadType<T>
	: T extends object ? (
		[AllMerged<T>] extends [never]
			? NonMerged<T>
			: MergeResult<NonMerged<T>, MergeObject<AllMerged<T>>>
		) & ([AllCorrelated<T>] extends [never] ? unknown : AllCorrelated<T>)
	: never;
