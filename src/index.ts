export * from './sync';
export * as utils from './utils';
export { BitField, BitFields} from './utils';
export * as async from './async';
export * as bit from './bit';
export * from './types';

import * as utils from './utils';
import { ReadType } from './sync';
import { as, Type2, TypeT2 } from './types';


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

export interface TSEnum {
	[key: string]:	string | number;
	[value: number]: string;
};

export function EnumV<V extends number|bigint, T extends TSEnum|Record<string, V>>(_: T) {
	return (x: V) => x as T[keyof T] & V;
}

export function Enum<V extends number|bigint, E extends TSEnum|Record<string, V>>(e: E) {
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
			return e2[Number(x)] ?? split_enum(x);
		},
		from(x: string) {
			const parts = x.split('+');
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

export function asEnum<V extends number|bigint, E extends TSEnum|Record<string, V>>(type: TypeT2<V>, e: E): TypeT2<string> {
	return as(type, Enum(e));
}
export function asEnum2<V extends number|bigint, E extends TSEnum|Record<string, V>>(type: TypeT2<V>, e: E) {
	const toString = Enum(e).to;
	return as(type, v => ({ valueOf: () => v, toString: () => toString(v) }));
}

//-----------------------------------------------------------------------------
// flags helpers
//-----------------------------------------------------------------------------

export function Flags<V extends number | bigint>(e: TSEnum|Record<string, V>, noFalse = true) {
	const e1 = Object.entries(e).filter(([, v]) => typeof v === 'number') as [string, number][];

	return {
		to(x: number | bigint) {
			return (typeof x === 'bigint'
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
			}, {} as Record<string, number | boolean>)
			) as Record<string, V | boolean>;
		},
		from(x: Record<string, V | boolean>) {
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
export function asFlags<V extends number | bigint>(type: TypeT2<V>, e: TSEnum|Record<string, V>, noFalse = true) {
	return as(type, Flags(e, noFalse));
}
export function asFlags2<V extends number | bigint>(type: TypeT2<V>, e: TSEnum|Record<string, V>, noFalse = true) {
	const toString = Flags(e, noFalse).to;
	return as(type, v => ({ valueOf: () => v, toString: () => toString(v) }));
}
