export * from './sync';
export * from './types';
export * from './common';
export { BitField } from './utilities/bitfields';
export * as async from './async';
export * as interop from './interop';
export { ReadClass, Class, Extend } from './interop';
export * as bit from './bit';

export * as bitfields from './utilities/bitfields';
export * as text from './utilities/text';
export { CRC as crc } from './utilities/crc';
export { Float as float } from './utilities/float';
export * as typedArray from './utilities/typedArray';

import { ReadType, IsPow2, isPow2, lowestSet } from './common';
import { as } from './types';
import * as interop from './interop';

//-----------------------------------------------------------------------------
// apply names to array elements
//-----------------------------------------------------------------------------

export function withNames<T>(array: T[], func:(v: T, i: number)=>string) : [string, T][] {
	return array.map((v, i) => [func(v, i) ?? `#${i}`, v] as [string, T]);
}

export const field = (field: string) 	=> (v: any) => v[field];
export const names = (names: string[])	=> (v: any, i: number) => names[i];

export function arrayWithNames<T extends interop.Type>(type: T, func:(v: any, i: number)=>string) {
	return as(type, array => withNames(array, func), v => v.map(([, v]) => v) as ReadType<T>);
}

export function objectWithNames<T extends interop.Type>(type: T, func:(v: any, i: number)=>string) {
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

export function asHex(type: interop.TypeT<number> | interop.TypeT<bigint> | interop.TypeT<number|bigint>): interop.TypeT<hex<number|bigint>> {
	return as(type, hex);// as interop.TypeT<hex<number|bigint>>;
}

//-----------------------------------------------------------------------------
// convert strings to integers
//-----------------------------------------------------------------------------

export function asInt<T extends string>(type: interop.TypeT<T>, radix = 10) {
	return as(type, x => parseInt(x.trim(), radix));
}

//-----------------------------------------------------------------------------
// convert integers to fixed point
//-----------------------------------------------------------------------------

export function asFixed<T extends number>(type: interop.TypeT<T>, fracbits: number) {
	const scale = 1 / (1 << fracbits);
	return as(type, x => x * scale);
}

export function asScaled<T extends number|bigint>(type: interop.TypeT<T>, scale: T, digits?: number) {
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
				},
				[Symbol.for('debug.description')]: () => (Number(x) / Number(scale)).toString(),
			};
		});
	}
	return as(type, x => ({
		x,
		valueOf: () => x / scale,
		toString: () => digits ? (x / scale).toFixed(digits) : (x / scale).toString(),
		[Symbol.for('debug.description')]: () => (x / scale).toString(),
	}));
}

//-----------------------------------------------------------------------------
// enum helpers
//-----------------------------------------------------------------------------

export interface TSEnum {
	[key: string]:	string | number;
	[value: number]: string;
};
type EnumType = TSEnum|Record<string, number|bigint>;
type EnumValue<E extends EnumType> = Extract<E[keyof E], number | bigint>;

export function EnumV<E extends EnumType>(_: E) {
	return {
		to:		(x: EnumValue<E>)	=> x as E[keyof E],
		from:	(x: E[keyof E])		=> x as number,
	};
//	return (x: EnumValue<T>) => x as T[keyof T];// & EnumValue<T>;
}

export function EnumString<E extends EnumType>(e: E) {
	type V = EnumValue<E>;
	const e1 = (Object.entries(e).filter(([, v]) => typeof v === 'number') as [string, number][]).sort(([, v1], [, v2]) => v2 - v1);
	const e2 = Object.fromEntries(e1.map(([k, v]) => [v, k]));
	const e0 = Object.fromEntries(e1);

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

	return {
		to(x: V) {
			return e2[Number(x)] as keyof E ?? split_enum(x);
		},
		from(x: keyof E) {
			const parts = (x as string).split('+');
			let value: number | bigint = 0;
			for (const part of parts) {
				const [k, n] = part.split('*');
				const v = e0[k];
				if (v === undefined)
					throw new Error(`Invalid enum value: ${part}`);
				if (typeof v === 'bigint')
					value = BigInt(value);
				const m = n ? parseInt(n) : 1;
				if (typeof value === 'bigint')
					value += BigInt(v) * BigInt(m);
				else
					value += v * m;
			}
			return value as V;
		}
	};
}

export function Enum<E extends EnumType>(e: E) {
	const toString = EnumString(e).to;
	return (v: EnumValue<E>) => ({ valueOf: () => v, toString: () => toString(v) });
}
//-----------------------------------------------------------------------------
// flags helpers
//-----------------------------------------------------------------------------
// Helper to generate all bit combinations
type BitCombinations<T extends number, Acc extends number = 0> =
	[T] extends [never]
		? Acc
		: T extends T
			? BitCombinations<Exclude<T, T>, Acc | T | (Acc | T)>
			: never;


export function FlagsV<T extends Record<string, number>>(_: T) {
	return (x: number) => x as BitCombinations<T[keyof T]>;
}

type FlagsObject<E extends EnumType, NoFalse extends boolean = true> = NoFalse extends true
	? Partial<{ [K in keyof E as IsPow2<E[K]> extends true ? K : never]: true; }> & { [K in keyof E as IsPow2<E[K]> extends false ? K : never]: E[K] extends bigint ? bigint : number; }
	: { [K in keyof E]: IsPow2<E[K]> extends true ? boolean : E[K] extends bigint ? bigint : number; };

export function Flags<E extends EnumType, NoFalse extends boolean = true>(e: E, noFalse: NoFalse = true as NoFalse) {
	type V = EnumValue<E>;
	const e1 = Object.entries(e).filter(([, v]) => typeof v === 'number') as [string, number][];

	return {
		to(x: number | bigint): FlagsObject<E, NoFalse> {
			return (typeof x === 'bigint'
			?	e1.reduce((obj, [k, v]) => {
					const y = x & BigInt(v);
					if (y || !noFalse)
						obj[k] = !isPow2(v) ? y / BigInt(lowestSet(v)) : !!y;
					return obj;
				}, {} as Record<string, bigint | boolean>)
			:	e1.reduce((obj, [k, v]) => {
					const y = x & v;
					if (y || !noFalse)
						obj[k] = !isPow2(v) ? y / lowestSet(v) : !!y;
					return obj;
				}, {} as Record<string, number | boolean>)
			) as FlagsObject<E, NoFalse>;
		},
		from(x: FlagsObject<E, true> | FlagsObject<E, false>) {
			let value: number | bigint = 0;
			for (const [k, v] of Object.entries(x)) {
				const ev = e[k];
				if (ev === undefined)
					throw new Error(`Invalid flag: ${k}`);
				if (typeof ev === 'bigint')
					value = BigInt(value);
				if (v) {
					if (typeof value === 'bigint')
						value += BigInt(ev);
					else
						value += Number(ev);
				}
			}
			return value as V;
		}
	};
}

/*
export function asFlags<V extends number | bigint, E extends EnumType>(type: interop.TypeT<V>, e: E, noFalse = true) {
	return as(type, Flags(e, noFalse));
}
export function asFlags2<V extends number | bigint, E extends EnumType>(type: interop.TypeT<V>, e: E, noFalse = true) {
	const flags = Flags(e, noFalse);
	return as(type, v => {
		const wrapper = {
			valueOf: () => v,
			test:	(flag: V) => v & flag,
			all:	(flag: V) => (v & flag) === flag,
			[Symbol.for('debug.description')]: () => `0x${v.toString(16)}`,
			[Symbol.for('debug.properties')]: () => flags.to(v)
		};
		return wrapper;
	});
}
*/