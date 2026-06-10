import {BitAdapter, BitInput, BitFields} from './bitfields';
import {bitsView} from './typedArray';
import {UpTo16, UpTo32, highestSetIndex } from '../common';

function compare<T extends number|bigint|string>(a: T, b: T): number {
	return a === b ? 0 : a > b ? 1 : -1;
}


export function isqrt(n: bigint) {
	if (n < 2n)
		return n;
	let x = 1n << BigInt((highestSetIndex(n) + 2) >> 1), y;
	while ((y = (x + n / x) >> 1n) < x)
		x = y;
	return x;
}

//-----------------------------------------------------------------------------
//	float
//-----------------------------------------------------------------------------

const cache: Record<string, Float<any, any>> = {};

const NumberDV	= new DataView(new ArrayBuffer(8));

function NumberToRep(f: number) {
	NumberDV.setFloat64(0, f, true);
	return NumberDV.getBigUint64(0, true);
}
function RepToNumber(i: bigint): number {
	NumberDV.setBigUint64(0, i, true);
	return NumberDV.getFloat64(0, true);
}

interface FloatParts<M extends number|bigint = number|bigint> {
	mantissa:	M,
	exponent:	number,
	sign:		number;
}

export function toNumber(parts: FloatParts) {
	return RepToNumber(float64.pack(parts));
}

function floatAdd(a: FloatParts, b: FloatParts) {
	if (a.exponent > b.exponent)
		[a, b] = [b,a];
	if (b.exponent === Infinity)
		return b;
	const am = BigInt(a.mantissa);
	const bm = BigInt(b.mantissa) << BigInt(b.exponent - a.exponent);
	return a.sign === b.sign
		? {mantissa: am + bm, exponent: a.exponent, sign: a.sign}
		: am >= bm
		? {mantissa: am - bm, exponent: a.exponent, sign: a.sign}
		: {mantissa: bm - am, exponent: a.exponent, sign: b.sign};
}

function floatMul(a: FloatParts, b: FloatParts) {
	return {mantissa: BigInt(a.mantissa) * BigInt(b.mantissa), exponent: a.exponent + b.exponent, sign: a.sign ^ b.sign};
}

function floatDiv(a: FloatParts, b: FloatParts, precision: number) {
	return !b.mantissa
		? {mantissa: 0n, exponent: Infinity, sign: a.sign ^ b.sign}
		: {mantissa: (BigInt(a.mantissa) << BigInt(precision)) / BigInt(b.mantissa), exponent: a.exponent - b.exponent - precision, sign: a.sign ^ b.sign};
}

function floatPow(a: FloatParts, b: FloatParts, precision: number) {
	const mul = (a: FloatParts<bigint>, b: FloatParts<bigint>) =>
		({mantissa: (a.mantissa * b.mantissa) >> BigInt(precision - 1), exponent: a.exponent + b.exponent + precision - 1, sign: 0});

	const sqrt = (a: FloatParts<bigint>): FloatParts<bigint> =>
		a.exponent & 1
			? {mantissa: isqrt(a.mantissa << BigInt(precision + 1)) >> 1n, exponent: (a.exponent - precision + 1) >> 1, sign: 0}
			: {mantissa: isqrt(a.mantissa << BigInt(precision)), exponent: (a.exponent - precision) >> 1, sign: 0};

	let result	= {mantissa: 1n << BigInt(precision), exponent: -precision, sign: 0};
	if (!b.mantissa)
		return result;
	if (!a.mantissa)
		return a;

	const shift	= highestSetIndex(a.mantissa) + 1 - precision;
	const am 	= shift > 0 ? BigInt(a.mantissa) >> BigInt(shift) : BigInt(a.mantissa) << BigInt(-shift);
	const bm	= BigInt(b.mantissa);

	const whole	= b.exponent < 0 ? (bm >> BigInt(-b.exponent)) : (bm << BigInt(b.exponent));
	if (whole) {
		let		base = {mantissa: am, exponent: a.exponent + shift, sign: 0};
		let		n;
		for (n = whole; !(n & 1n); n >>= 1n)
			base = mul(base, base);

		result = base;
		for (n >>= 1n; n; n >>= 1n) {
			base = mul(base, base);
			if (n & 1n)
				result = mul(result, base);
		}
	}

	if (b.exponent < 0) {
		const	fracBits= Math.min(-b.exponent, precision + 4);
		let		mask	= 1n << BigInt(fracBits);
		let 	frac	= (bm >> BigInt(-b.exponent - fracBits)) & (mask - 1n);
		if (frac && a.sign)
			return {mantissa: 0n, exponent: Infinity, sign: 1};

		let		base	= {mantissa: am, exponent: a.exponent + shift, sign: 0};
		for (mask >>= 1n; frac; mask >>= 1n) {
			base = sqrt(base);
			if (frac & mask) {
				result = mul(result, base);
				frac -= mask;
			}
		}
	}

	if (b.sign)
		 result = {mantissa: (1n << BigInt(precision << 1)) / result.mantissa, exponent: -result.exponent - (precision << 1), sign: 0};

	if (a.sign && (whole & 1n))
		result.sign = 1;
	return result;
}

function floatMod(a: FloatParts, b: FloatParts) {
	if (!b.mantissa || a.exponent === Infinity)
		return {mantissa: 0, exponent: Infinity, sign: a.sign ^ b.sign};
	if (b.exponent === Infinity)
		return a;
	const e = Math.min(a.exponent, b.exponent);
	return {mantissa: (BigInt(a.mantissa) << BigInt(a.exponent - e)) % (BigInt(b.mantissa) << BigInt(b.exponent - e)), exponent: e, sign: a.sign};
}

function floatCompare(a: FloatParts, b: FloatParts) {
	const sign = a.sign ? -1 : 1;
	if (a.sign !== b.sign)
		return sign;

	let am	= BigInt(a.mantissa);
	let bm	= BigInt(b.mantissa);
	const e	= a.exponent - b.exponent;
	if (e < 0)
		bm <<= BigInt(-e);
	else if (e > 0)
		am <<= BigInt(e);

	return am === bm ? 0 : am > bm ? sign : -sign;
}

export interface FloatInstance<R extends number | bigint = number | bigint, M extends number | bigint = R> {
	raw: R;
	from(x: number): 	this;
	parts():			FloatParts<M>;
	valueOf():			number;
	toString(): 		string;
	abs():				this;
	neg():				this;
	add(b: this):		this;
	sub(b: this):		this;
	mul(b: this):		this;
	div(b: this):		this;
	mod(b: this):		this;
	pow(b: this):		this;
	compare(b: this):	number;
}

interface Float<R extends number | bigint, M extends number|bigint> extends BitAdapter<R, FloatInstance<R, M>> {
	(value: number):	FloatInstance<R, M>;

	bits: number;
	to(i: number|bigint):			FloatInstance<R, M>;
	from(x: FloatInstance<R, M>):	R;
	parts(mantissa: M, exp: number, sign: number): FloatInstance<R, M>;
	split(raw: R): 		FloatParts<M>;
	pack(parts: FloatParts): R;
}

export const float8e4m3 = Float(3, 4);
export const float8e5m2 = Float(2, 5);
export const float16	= Float(10, 5);
export const Bfloat16	= Float(7, 8);
export const float32	= Float(23, 8);
export const float64	= Float(52, 11);
export const float128	= Float(112, 15);

export function Float<M extends number>(mbits: M, ebits: number, ebias = (1 << (ebits - 1)) - 1, sbit = true): Float<M extends UpTo32 ? number : bigint, BitInput<M>> {
	const id = `${mbits},${ebits},${ebias},${sbit}`;
	if (cache[id])
		return cache[id];

	const bits = BitFields(0, {
		mantissa:	mbits as number,
		exponent:	ebits as UpTo32,
		sign:		(sbit ? 1 : 0) as UpTo16,
	});

	type MT			= BitInput<M>;
	type RT			= M extends UpTo32 ? number : bigint;
	type Instance	= FloatInstance<RT, MT>;

	const emax		= (1 << ebits) - 1;
	const mimpN		= 2 ** mbits;
	const mimpB		= 1n << BigInt(mbits);
	const signN		= sbit ? 1 << (mbits + ebits) : 0;
	const signB 	= sbit ? 1n << BigInt(mbits + ebits) : 0n;

	ebias += mbits;

	const splitAdjust = (parts: FloatParts) => {
		const m = parts.mantissa;
		const e = parts.exponent;
		return	e === emax	? {mantissa: m, exponent: Infinity, sign: parts.sign}
			:	e === 0		? {mantissa: m, exponent: 1 - ebias, sign: parts.sign}
			:	{mantissa: typeof m === "bigint" ? m + mimpB : m + mimpN, exponent: e - ebias, sign: parts.sign};
	};

	const packAdjust = (parts: FloatParts) => {
		if (parts.mantissa === 0)
			return {mantissa: 0, exponent: parts.exponent === Infinity ? emax : 0, sign: parts.sign};

		let shift	= highestSetIndex(parts.mantissa) - mbits;
		let e		= parts.exponent + ebias + shift;
		if (e >= emax)
			return {mantissa: 0, exponent: emax, sign: parts.sign};

		if (e <= 0) {
			shift	-= e - 1;
			e		= 0;
		}
		return {mantissa: shift < 0 ? BigInt(parts.mantissa) << BigInt(-shift) : BigInt(parts.mantissa) >> BigInt(shift), exponent: e, sign: parts.sign};
	};

	const prototype = mbits === 52 && ebits === 11 && ebias === 1023 && sbit ? {
		raw: 0n,
		from(x: number)		{ return rawN(x); },
		parts()				{ return splitAdjust(bits.to(this.raw)); },
		valueOf()			{ return RepToNumber(this.raw); },
		toString()			{ return this.valueOf().toString(); },
		abs() 				{ return make(this.raw & ~signB); },
		neg() 				{ return make(this.raw ^ signB); },
		add(b)				{ return rawN(+this + +b); },
		sub(b)				{ return rawN(+this - +b); },
		mul(b)				{ return rawN(+this * +b); },
		div(b)				{ return rawN(+this / +b); },
		mod(b)				{ return rawN(+this % +b); },
		pow(b)				{ return rawN((+this) ** (+b)); },
		compare(b)			{ return compare(+this, +b); },
	} as FloatInstance<bigint, number> : bits.bits > 32 ? {
		raw: 0n,
		from(x: number)		{ return rawP(float64.split(NumberToRep(x))); },
		parts()				{ return splitAdjust(bits.to(this.raw)); },
		valueOf()			{ return RepToNumber(float64.pack(splitAdjust(bits.to(this.raw)))); },
		toString()			{ return this.valueOf().toString(); },
		abs() 				{ return make(this.raw & ~signB); },
		neg() 				{ return make(this.raw ^ signB); },
		add(b)				{ return rawP(floatAdd(this.parts(), b.parts())); },
		sub(b)				{ return rawP(floatAdd(this.parts(), b.neg().parts())); },
		mul(b)				{ return rawP(floatMul(this.parts(), b.parts())); },
		div(b)				{ return rawP(floatDiv(this.parts(), b.parts(), mbits)); },
		mod(b)				{ return rawP(floatMod(this.parts(), b.parts())); },
		pow(b)				{ return rawP(floatPow(this.parts(), b.parts(), mbits + 8)); },
		compare(b)			{ return floatCompare(this.parts(), b.parts()); },
	} as FloatInstance<bigint, bigint> : {
		raw: 0,
		from(x: number)		{ return rawP(float64.split(NumberToRep(x))); },
		parts()				{ return splitAdjust(bits.to(this.raw)); },
		valueOf()			{ return RepToNumber(float64.pack(splitAdjust(bits.to(this.raw)))); },
		toString()			{ return this.valueOf().toString(); },
		abs() 				{ return make(this.raw & ~signN); },
		neg() 				{ return make(this.raw ^ signN); },
		add(b)				{ return rawP(floatAdd(this.parts(), b.parts())); },
		sub(b)				{ return rawP(floatAdd(this.parts(), b.neg().parts())); },
		mul(b)				{ return rawP(floatMul(this.parts(), b.parts())); },
		div(b)				{ return rawP(floatDiv(this.parts(), b.parts(), mbits)); },
		mod(b)				{ return rawP(floatMod(this.parts(), b.parts())); },
		pow(b)				{ return rawP(floatPow(this.parts(), b.parts(), mbits + 8)); },
		compare(b)			{ return floatCompare(this.parts(), b.parts()); },
	} as FloatInstance<number, number>;

	function make(i: number|bigint) {
		const obj = Object.create(prototype) as Instance;
		obj.raw = i as RT;
		return obj;
	}
	const rawN	= (f: number) => make(NumberToRep(f));
	const rawP	= (p: FloatParts) => make(bits.from(packAdjust(p)));
	const getter = bitsView(bits.bits, true);

	return cache[id] = Object.assign((prototype as Instance).from, {
		bits:	bits.bits,
		to:		make,
		get:	(dv: DataView, offset: number) => make(getter.get(dv, offset)),
		set:	(dv: DataView, offset: number, v: Instance) => getter.set(dv, offset, v.raw),
		from(x: Instance) 			{ return x.raw; },
		split(raw: number|bigint)	{ return splitAdjust(bits.to(raw)) as FloatParts<MT>; },
		pack(parts: FloatParts)		{ return bits.from(packAdjust(parts)) as RT; },
		parts(mantissa: MT, exponent: number, sign: number) { return make(bits.from(packAdjust({mantissa, exponent, sign}))); },
	});
}
