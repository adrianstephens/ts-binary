import { isLittleEndian } from '../common'
import { Descriptor, calcBits, BitViewer, BitViewerSigned, BitViewerUnsigned, BitFieldsViewer } from './bitfields'

//-----------------------------------------------------------------------------
//	buffers
//-----------------------------------------------------------------------------

export interface TypedArray<R = any> extends ArrayBufferView {
	length:			number;
    [n: number]:	R;

	[Symbol.iterator](): IterableIterator<R>;
	slice(begin:	number, end?: number): this;
	subarray(begin: number, end?: number): this;
	set(array: ArrayLike<R>, offset?: number): void;

	copyWithin(target: number, start: number, end?: number): this;
	every(callback: (value: R, index: number, array: this) => unknown, thisArg?: any): boolean;
	fill(value: R, start?: number, end?: number): this;
	filter(callback: (value: R, index: number, array: this) => any, thisArg?: any): this;
	find(callback: (value: R, index: number, array: this) => boolean, thisArg?: any): R | undefined;
	findIndex(callback: (value: R, index: number, array: this) => boolean, thisArg?: any): number;
	forEach(callback: (value: R, index: number, array: this) => void, thisArg?: any): void;
	indexOf(searchElement: R, fromIndex?: number): number;
	join(separator?: string): string;
	lastIndexOf(searchElement: R, fromIndex?: number): number;
	map(callback: (value: R, index: number, array: this) => any, thisArg?: any): this;
	reduce(callback: (prev: R, curr: R, index: number, array: this) => R, initial?: R): R;
    reduce<U>(callback: (prev: U, curr: R, index: number, array: this) => U, initial: U): U;
	reduceRight(callback: (prev: R, curr: R, index: number, array: this) => R, initial?: R): R;
    reduceRight<U>(callback: (prev: U, curr: R, index: number, array: this) => U, initial: U): U;
	reverse(): this;
	some(callback: (value: R, index: number, array: this) => unknown, thisArg?: any): boolean;
	sort(compareFn?: (a: R, b: R) => number): this;
	toString(): string;
}

const TypedArrayProto = {
    copyWithin: 	Array.prototype.copyWithin,
    every: 			Array.prototype.every,
    fill: 			Array.prototype.fill,
    filter: 		Array.prototype.filter,
    find: 			Array.prototype.find,
    findIndex: 		Array.prototype.findIndex,
    forEach: 		Array.prototype.forEach,
    indexOf: 		Array.prototype.indexOf,
    join: 			Array.prototype.join,
    lastIndexOf: 	Array.prototype.lastIndexOf,
    map: 			Array.prototype.map,
    reduce: 		Array.prototype.reduce,
    reduceRight: 	Array.prototype.reduceRight,
    reverse: 		Array.prototype.reverse,
    some: 			Array.prototype.some,
    sort: 			Array.prototype.sort,
    toString: 		Array.prototype.toString,
};

export interface TypedArrayLike {
	byteLength: number,
}
export type ViewMaker<T> = (new(a: ArrayBufferLike, offset: number, length: number)=>T) & {BYTES_PER_ELEMENT?: number};
export type TypedElement<T> = T extends TypedArray<infer R> ? R : T extends TypedArrayConstructor<infer R> ? R : never;
/*
export interface TypedArrayConstructor<T extends TypedArray = TypedArray> {
	BYTES_PER_ELEMENT?: number;
	new(length: number): T;
	new(array: ArrayLike<TypedElement<T>>): T;
//	new<TArrayBuffer extends ArrayBufferLike = ArrayBuffer>(buffer: TArrayBuffer, byteOffset?: number, length?: number): T;
	new(buffer: ArrayBufferLike, byteOffset?: number, length?: number): T;
	new(elements: Iterable<TypedElement<T>>): T;

	of(...items: TypedElement<T>[]): T;
	from(array: ArrayLike<TypedElement<T>>): T;
	from<U>(array: ArrayLike<U>, mapfn: (v: U, k: number) => TypedElement<T>, thisArg?: any): T;
	from(elements: Iterable<TypedElement<T>>): T;
	from<U>(elements: Iterable<U>, mapfn?: (v: U, k: number) => TypedElement<T>, thisArg?: any): T;
};
*/
export interface TypedArrayConstructor<T> {
	readonly BYTES_PER_ELEMENT?: number;
	new(length: number): TypedArray<T>;
	new(array: ArrayLike<T>): TypedArray<T>;
//	new<TArrayBuffer extends ArrayBufferLike = ArrayBuffer>(buffer: TArrayBuffer, byteOffset?: number, length?: number): TypedArray<T>;
	new(buffer: ArrayBufferLike, byteOffset?: number, length?: number): TypedArray<T>;
	new(elements: Iterable<T>): TypedArray<T>;

	of(...items: T[]): TypedArray<T>;
	from(array: ArrayLike<T>): TypedArray<T>;
	from<U>(array: ArrayLike<U>, mapfn: (v: U, k: number) => T, thisArg?: any): TypedArray<T>;
	from(elements: Iterable<T>): TypedArray<T>;
	from<U>(elements: Iterable<U>, mapfn?: (v: U, k: number) => T, thisArg?: any): TypedArray<T>;
};
//export type ViewInstance<V> = V extends new(a: SharedArrayBuffer, o: number, l: number) => infer T ? T : never;

// I am not happy about this, but I can't find a way to avoid ArrayBuffer without it
export type ViewInstance<V> = 
    V extends typeof Uint8Array		? Uint8Array<ArrayBufferLike>		:
    V extends typeof Int8Array		? Int8Array<ArrayBufferLike>		:
    V extends typeof Uint16Array	? Uint16Array<ArrayBufferLike>		:
    V extends typeof Int16Array		? Int16Array<ArrayBufferLike>		:
    V extends typeof Uint32Array	? Uint32Array<ArrayBufferLike>		:
    V extends typeof Int32Array		? Int32Array<ArrayBufferLike>		:
    V extends typeof Float32Array	? Float32Array<ArrayBufferLike>		:
    V extends typeof Float64Array	? Float64Array<ArrayBufferLike>		:
    V extends typeof BigUint64Array	? BigUint64Array<ArrayBufferLike>	:
    V extends typeof BigInt64Array	? BigInt64Array<ArrayBufferLike>	:
    V extends new(a: ArrayBufferLike, o: number, l: number) => infer T ? T : never;

interface TypedArrayBacking<R> {
	byteLength: number,
	get(index: number): R;
	set(index: number, value: R): void;
};
type TypedArrayBackingFactory<R> = (buffer: ArrayBufferLike, byteOffset: number, begin: number, length: number) => TypedArrayBacking<R>;

function TypedArray<R>(backingFactory: TypedArrayBackingFactory<R>, BYTES_PER_ELEMENT?: number) {
	const bpe = BYTES_PER_ELEMENT ?? 1;

	function make(buffer: ArrayBufferLike, byteOffset: number, begin: number, length: number): TypedArray<R> {
		const backing = backingFactory(buffer, byteOffset, begin, length);
		return new Proxy(Object.assign(Object.create(TypedArrayProto), {
			length,
			buffer,
			byteOffset,
			byteLength: backing.byteLength,
			constructor: ctor,
			slice(begin: number, end?: number) 			{ return make(buffer, byteOffset, begin, (end ? Math.min(end, length) : length) - begin); },
			subarray(begin: number, end?: number) 		{ return make(buffer, byteOffset, begin, (end ? Math.min(end, length) : length) - begin); },
			set(array: ArrayLike<R>, offset?: number)	{
				for (let i = 0; i < array.length; i++)
					backing.set((offset ?? 0) + i, array[i]);
			},
			[Symbol.iterator](): IterableIterator<R> {
				let index = 0;
				return {
					next: () => {
						return index < length
							? { value: backing.get(index++) as R, done: false }
							: { value: undefined, done: true };
					},
					[Symbol.iterator]() {
						return this;
					}
				};
			},
		}), {
			get(target, prop) {
				if (prop in target)
					return target[prop as keyof typeof target];

				const index = Number(prop);
				return !isNaN(index) && index >= 0 && index < length ? backing.get(index) : undefined;
			},
			set(_target, prop, value: R) {
				const index = Number(prop);
				if (!isNaN(index) && index >= 0 && index < length) {
					backing.set(index, value);
					return true;
				}
				return false;
			}
		}) as TypedArray<R>;
	}

	function create(n: number) {
		return make(new ArrayBuffer(Math.ceil(n * bpe)), 0, 0, n);
	}
	function fromArray(array: ArrayLike<R>) {
		const r = create(array.length);
		r.set(array);
		return r;
	}
	function fromBuffer(buffer: ArrayBufferLike, byteOffset = 0, byteLength = buffer.byteLength - byteOffset) {
		return make(buffer, byteOffset, 0, Math.floor(byteLength / bpe));
	}

	function ctor(...args: any[]) {
		if (args.length > 1) {
			const [buffer, byteOffset, length] = args as [ArrayBufferLike, number, number?];
			return make(buffer, byteOffset, 0, length ?? Math.floor((buffer.byteLength - byteOffset) / bpe));
		}
		const a = args[0];
		if (a === undefined)
			return create(0);
		if (typeof a === "number")
			return create(a);
		if (a instanceof ArrayBuffer)
			return fromBuffer(a);
		if (ArrayBuffer.isView(a))
			return fromBuffer(a.buffer, a.byteOffset, a.byteLength);
		return fromArray(typeof (a as any)[Symbol.iterator] === 'function' ? Array.from(a as Iterable<R>) : a as ArrayLike<R>);
	}
	return Object.assign(ctor, {
		BYTES_PER_ELEMENT,
		from(a: ArrayLike<R>|Iterable<R>, mapfn?: (v: R, k: number) => R, thisArg?: any): TypedArray<R> {
			if (!mapfn) {
				if (a instanceof ArrayBuffer)
					return fromBuffer(a);
				if (ArrayBuffer.isView(a))
					return fromBuffer(a.buffer, a.byteOffset, a.byteLength);
			}
			const array	= typeof (a as any)[Symbol.iterator] === 'function'
				? (mapfn ? Array.from(a as Iterable<R>, mapfn, thisArg) : Array.from(a as Iterable<R>))
				: (mapfn ? Array.from(a as ArrayLike<R>, mapfn, thisArg) : Array.from(a as ArrayLike<R>));
			return fromArray(array);
		},
		of(...items: R[]): TypedArray<R> {
			return fromArray(items);
		}

	}) as any as TypedArrayConstructor<R>;
}

function BitViewerTypedArray<D>(bits: number, viewer: BitViewer<D>): TypedArrayConstructor<D> {
	if ((bits & 7) === 0) {
		const bytes	= (bits + 7) >> 3;
		return TypedArray((buffer: ArrayBufferLike, byteOffset: number, begin: number, length: number) => {
			const byteLength = length * bytes;
			const dv = new DataView(buffer, byteOffset + begin * bytes, byteLength);
			return {
				byteLength,
				get(index: number)				{ return viewer.get(dv, index * bits); },
				set(index: number, value: any)	{ viewer.set(dv, index * bits, value); }
			};
		}, bytes);
	} else {
		return TypedArray((buffer: ArrayBufferLike, byteOffset: number, begin: number, length: number) => {
			const shift = (begin * bits) & 7;
			const byteLength = (shift + length * bits + 7) >> 3;
			const dv = new DataView(buffer, byteOffset + ((begin * bits) >> 3), byteLength);
			return {
				byteLength,
				get(index: number)				{ return viewer.get(dv, shift + index * bits); },
				set(index: number, value: any)	{ viewer.set(dv, shift + index * bits, value); }
			};
		}, bits / 8);
	}
}


export function Uint<N extends number>(bits: N, be?: boolean) {
	return BitViewerTypedArray(bits, BitViewerUnsigned(bits, be));
}

export function Int<N extends number>(bits: N, be?: boolean) {
	return BitViewerTypedArray(bits, BitViewerSigned(bits, be));
}

export function BitFields<T extends Descriptor>(bitfields: T, be = false) {
	const bits		= calcBits(bitfields);
	const viewer	= BitFieldsViewer(bitfields, be, bits & 7 ? undefined : 0);
	return BitViewerTypedArray(bits, viewer);
}
/*
export function BitAdapterTypedArray<D>(adapter: BitAdapter<any, D>, be?: boolean) {
	const bits		= adapter.bits;
    const viewer	= BitViewerUnsigned(bits, be, bits & 7 ? undefined : 0);
	//const viewer	= BitViewerChain(BitViewerUnsigned(bits, be, bits & 7 ? undefined : 0), adapter);
	return BitViewerTypedArray(bits, {
        get:(dv, offset)    => adapter.to(viewer.get(dv, offset)),
        set:(dv, offset, w) => viewer.set(dv, offset, adapter.from(w))
    });
}
*/

type DataViewType = 'Uint8' | 'Int8' | 'Uint16' | 'Uint32' | 'BigUint64' | 'Int16' | 'Int32' | 'BigInt64' | 'Float32' | 'Float64';
type DataViewReturnType<T extends DataViewType> = T extends 'BigUint64' ? bigint : T extends 'BigInt64' ? bigint : number;

const typedArrays: Record<DataViewType, TypedArrayConstructor<any>> = {
	Uint8: 		Uint8Array,
	Int8: 		Int8Array,
	Uint16: 	Uint16Array,
	Int16: 		Int16Array,
	Uint32: 	Uint32Array,
	Int32: 		Int32Array,
	BigUint64: 	BigUint64Array,
	BigInt64: 	BigInt64Array,
	Float32: 	Float32Array,
	Float64: 	Float64Array,
} as const;

export function DataViewTypedArray<T extends DataViewType>(type: T, be?: boolean) {
	const BYTES_PER_ELEMENT	= typedArrays[type].BYTES_PER_ELEMENT ?? 1;
	return TypedArray(
		(buffer: ArrayBufferLike, byteOffset: number, begin: number, length: number) => {
			const byteLength = length * BYTES_PER_ELEMENT;
			const dv		= new DataView(buffer, byteOffset + begin * BYTES_PER_ELEMENT, byteLength);
			const getter	= dv[`get${type}`].bind(dv) as (offset: number, littleEndian?: boolean) => DataViewReturnType<T>;
			const setter	= dv[`set${type}`].bind(dv) as (offset: number, value: DataViewReturnType<T>, littleEndian?: boolean) => void;
			return {
				byteLength,
				get: index => getter(index * BYTES_PER_ELEMENT, !be),
				set: (index, value) => setter(index * BYTES_PER_ELEMENT, value, !be),
			};
		},
		BYTES_PER_ELEMENT
	);
}

export const Uint16be		= DataViewTypedArray('Uint16', true);		export type Uint16be	= InstanceType<typeof Uint16be>;
export const Uint32be		= DataViewTypedArray('Uint32', true);		export type Uint32be	= InstanceType<typeof Uint32be>;
export const BigUint64be	= DataViewTypedArray('BigUint64', true);	export type BigUint64be	= InstanceType<typeof BigUint64be>;
export const Int16be		= DataViewTypedArray('Int16', true);		export type Int16be		= InstanceType<typeof Int16be>;
export const Int32be		= DataViewTypedArray('Int32', true);		export type Int32be		= InstanceType<typeof Int32be>;
export const BigInt64be		= DataViewTypedArray('BigInt64', true);		export type BigInt64be	= InstanceType<typeof BigInt64be>;
export const Float32be		= DataViewTypedArray('Float32', true);		export type Float32be	= InstanceType<typeof Float32be>;
export const Float64be		= DataViewTypedArray('Float64', true);		export type Float64be	= InstanceType<typeof Float64be>;

export function make<T extends DataViewType>(length: number, type:T, be?: boolean) {
	const BYTES_PER_ELEMENT = typedArrays[type].BYTES_PER_ELEMENT ?? 1;
	const arrayType = be !== isLittleEndian ? typedArrays[type] : DataViewTypedArray(type, be);
	return new arrayType(new ArrayBuffer(length * BYTES_PER_ELEMENT), 0, length);
}

export function as<T extends DataViewType>(arg: TypedArray, type: T, be?: boolean): TypedArray<DataViewReturnType<T>>;
export function as<T extends DataViewType>(arg: TypedArray|undefined, type: T, be?: boolean): TypedArray<DataViewReturnType<T>>|undefined;
export function as(arg: TypedArray|undefined, type: DataViewType, be?: boolean) {
    if (!arg)
        return undefined;
	const BYTES_PER_ELEMENT = typedArrays[type].BYTES_PER_ELEMENT ?? 1;
	const arrayType = be !== isLittleEndian && arg.byteOffset % BYTES_PER_ELEMENT === 0 ? typedArrays[type] : DataViewTypedArray(type, be);
	return new arrayType(arg.buffer, arg.byteOffset, Math.floor(arg.byteLength / BYTES_PER_ELEMENT));
}

export function concatenate<T extends TypedArray>(buffers: T[]): T {
	const out 	= new ArrayBuffer(buffers.reduce((sum, buf) => sum + buf.byteLength, 0));
	const out8	= new Uint8Array(out);
	let offset = 0;
	for (const buf of buffers) {
		out8.set(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength), offset);
		offset += buf.byteLength;
	}
	return new (buffers[0].constructor as new (out: ArrayBuffer)=>T)(out);
}
