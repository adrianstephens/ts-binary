export * from './sync';
export * as utils from './utils';
export * as async from './async';
export * as bit from './bit';
export * from './types';

//shortcuts

import * as utils from './utils';
import { ReadType } from './sync';
import { as, adapter, make, Type2, TypeT2, unmake } from './types';

//-----------------------------------------------------------------------------
// apply names to array elements
//-----------------------------------------------------------------------------

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

//-----------------------------------------------------------------------------
// hold numbers as hex
//-----------------------------------------------------------------------------

export class hex<T extends number | bigint> {
	constructor(public value: T) {}
	valueOf()	{ return this.value; }
	toString()	{ return '0x' + this.value.toString(16); }
};

export function asHex(type: TypeT2<number> | TypeT2<bigint> | TypeT2<number|bigint>): TypeT2<hex<number|bigint>> {
	return as(type as any, hex as any) as TypeT2<hex<number|bigint>>;
}

//-----------------------------------------------------------------------------
// convert strings to integers
//-----------------------------------------------------------------------------

export function asInt<T extends string>(type: TypeT2<T>, radix = 10) {
	return as(type, x => parseInt(x.trim(), radix));
}

//-----------------------------------------------------------------------------
// convert integers to fixed point
//-----------------------------------------------------------------------------

export function asFixed<T extends number>(type: TypeT2<T>, fracbits: number) {
	const scale = 1 / (1 << fracbits);
	return as(type, x => x * scale);
}

export function asScaled<T extends number|bigint>(type: TypeT2<T>, scale: T, digits?: number) {
	if (typeof scale === 'bigint') {
		return as(type, _x => {
			const x = BigInt(_x);
			return {
				x,
				valueOf: () => Number(x) / Number(scale),
				toString: () => {
					const a		= x < 0n ? -x : x;
					const sfrac = Number(a % scale) / Number(scale);
					return `${x < 0n ? '-' : ''}${a / scale}${(digits ? sfrac.toFixed(digits) : sfrac.toString()).slice(1)}`;
				}
			};
		});
	}
	return as(type, x => ({
		x,
		valueOf: () => x / scale,
		toString: () => digits ? (x / scale).toFixed(digits) : (x / scale).toString()
	}));
}

//-----------------------------------------------------------------------------
// enum helpers
//-----------------------------------------------------------------------------

export type EnumType = {
	[key: string]:	string | number;
	[value: number]: string;
} | {
	[key: string]:	number
};

export function EnumV<T extends EnumType>(_: T) {
	return (x: number) => x as T[keyof T] & number;
}

export function Enum(e: EnumType) {
	const e1 = (Object.entries(e).filter(([, v]) => typeof v === 'number') as [string, number][]).sort(([, v1], [, v2]) => v2 - v1);
	const e2 = Object.fromEntries(e1.map(([k, v]) => [v, k]));

	function split_enum(x: number | bigint): string {
		const results: string[] = [];
		for (const k of e1) {
			if (k[1] === 0) {
				if (x == 0)
					return k[0];
				break;
			}
			const n = typeof x === 'bigint' ? x / BigInt(k[1]) : Math.floor(x / k[1]);
			if (n) {
				results.push(n > 1 ? `${k[0]}*${n}` : k[0]);
				if (typeof x === 'bigint')
					x %= BigInt(k[1]);
				else
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
export function asEnum<T extends number|bigint, E extends EnumType>(type: TypeT2<T>, e: E): TypeT2<string> {
	return as(type, Enum(e));
}
export function asEnum2<T extends number|bigint, E extends EnumType>(type: TypeT2<T>, e: E) {
	const toString = Enum(e);
	return as(type, v => ({ valueOf: () => v, toString: () => toString(v) }));
}

//-----------------------------------------------------------------------------
// flags helpers
//-----------------------------------------------------------------------------

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
export function asFlags<T extends TypeT2<number> | TypeT2<bigint>, E extends EnumType>(type: T, e: E, noFalse = true) {
	return as(type, Flags(e, noFalse));
}

//-----------------------------------------------------------------------------
// bitfields
//-----------------------------------------------------------------------------

export type BitField<D> = [number, adapter<number, D>];

export function BitFields<T extends Record<string, number | BitField<any>>>(bitfields: T) {
	type Num = {[K in keyof T]: T[K] extends BitField<infer D> ? D : number;};
	type Big = {[K in keyof T]: T[K] extends BitField<infer D> ? D : bigint;};

	const to = (x: number | bigint) => {
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
			return obj;
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
			return obj;
		}
	};

	const from = (obj: Record<string, any>) => {
		let x	= 0n;
		let big = false;
		for (const i in bitfields) {
			const bf	= bitfields[i];
			const bits	= typeof bf === 'number' ? bf : bf[0];
			const v		= obj[i];
			const raw	= typeof bf === 'number' ? v : unmake(bf[1], v);
			if (typeof raw === 'bigint')
				big = true;
			x = (x << BigInt(bits)) | BigInt(raw as number | bigint);
		}
		return big ? x : Number(x);
	};

	return {
		to:		to		as ((x: number, _opt?: any) => Num)		& ((x: bigint, _opt?: any) => Big),
		from:	from	as ((obj: Num, _opt?: any) => number)	& ((obj: Big, _opt?: any) => bigint),
	};
}
