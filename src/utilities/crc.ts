import { highestSetIndex, bitReverse } from '../common';

export interface CRC<T extends number|bigint> {
	more(data: Uint8Array, crc: T): T;
	finish(crc: T): T;
	byte(crc: T, i: number): T;
	buffer(data: Uint8Array, crc?: T): T;
}

//	init and finalXor are accepted as-is; result is normalized at return.
//	For standards-compatible CRC model values, pass width-masked parameters.

const cache: Record<string, CRC<any>> = {};

export function CRC(poly: number, initial: number, finalXor: number, refin?: boolean, refout?: boolean): CRC<number>;
export function CRC(poly: bigint, initial: bigint, finalXor: bigint, refin?: boolean, refout?: boolean): CRC<bigint>;
export function CRC(poly: number|bigint, initial: number|bigint, finalXor: number|bigint, refin = true, refout = refin): CRC<any> {

	const id = `${poly},${initial},${finalXor},${refin},${refout}`;
	if (cache[id])
		return cache[id];

	const bits = highestSetIndex(poly) + 1;
	if (!refin)
		poly = bitReverse(poly, bits);

	if (bits <= 32) {
		initial		= Number(initial);

		const mask		= (2 ** bits) - 1;
		const msb		= bits > 8 ? 1 << (bits - 1) : 0x80;
		const polyN		= refin || bits >= 8 ? Number(poly) : Number(poly) << (8 - bits);
		const xorout	= Number(finalXor);

		const finish	= refin !== refout
			? (crc: number) => ((bitReverse(crc, bits) as number) ^ xorout) >>> 0
			: (crc: number) => ((crc & mask) ^ xorout) >>> 0;

		const table		= Uint32Array.from({length: 256}, refin
			? (_, crc: number) => {
				for (let k = 0; k < 8; k++)
					crc = (crc & 1 ? (crc >>> 1) ^ polyN : crc >>> 1);
				return crc;
			} : (_, i: number) => {
				let crc = bits > 8 ? i << (bits - 8) : i;
				for (let k = 0; k < 8; k++)
					crc = (crc & msb ? (crc << 1) ^ polyN : crc << 1);
				return crc;
			}
		);

		const byte = refin
			? (crc: number, i: number) => table[(crc ^ i) & 0xff] ^ (crc >>> 8)
			: bits > 8
			? (crc: number, i: number) => (crc << 8) ^ table[((crc >>> (bits - 8)) ^ i) & 0xff]
			: (crc: number, i: number) => table[(crc ^ i) & 0xff];

		const more = (data: Uint8Array, crc: number) => {
			for (const i of data)
				crc = byte(crc, i);
			return crc;
		};

		return cache[id] = refin || bits >= 8 ? {
			more,
			finish,
			byte:	(crc: number, i: number) => (byte(crc, i) & mask) >>> 0,
			buffer:	(data: Uint8Array, crc = initial) => finish(more(data, crc)),
		} : {
			more,
			finish:	(crc: number) => finish(crc >> (8 - bits)),
			byte:	(crc: number, i: number) => byte(crc << (8 - bits), i) >> (8 - bits),
			buffer:	(data: Uint8Array, crc = initial) => finish(more(data, crc << (8 - bits)) >> (8 - bits)),
		};
		
	} else {
		initial		= BigInt(initial);

		const bbits		= BigInt(bits);
		const mask		= (1n << bbits) - 1n;
		const msb		= 1n << (bbits - 1n);
		const polyN		= BigInt(poly);
		const xorout	= BigInt(finalXor);

		const finish	= refin !== refout
			? (crc: bigint) => (bitReverse(crc, bits) as bigint) ^ xorout
			: (crc: bigint) => (crc & mask) ^ xorout;

		const table		= Array.from({length: 256}, refin
			? (_: any, i: number) => {
				let crc = BigInt(i);
				for (let k = 0; k < 8; k++)
					crc = (crc & 1n ? (crc >> 1n) ^ polyN : crc >> 1n);
				return crc;
			} : (_: any, i: number) => {
				let crc = BigInt(i) << BigInt(bits - 8);
				for (let k = 0; k < 8; k++)
					crc = (crc & msb ? (crc << 1n) ^ polyN : crc << 1n);
				return crc;
			}
		);

		const byte = refin
			? (crc: bigint, i: number) => table[Number((crc ^ BigInt(i)) & 0xffn)] ^ (crc >> 8n)
			: (crc: bigint, i: number) => (crc << 8n) ^ table[Number(((crc >> BigInt(bits - 8)) ^ BigInt(i)) & 0xffn)];

		const more = (data: Uint8Array, crc: bigint) => {
			for (const i of data)
				crc = byte(crc, i);
			return crc;
		};

		return cache[id] = {
			more,
			finish,
			byte:	(crc: bigint, i: number) => byte(crc, i) & mask,
			buffer:	(data: Uint8Array, crc = initial) => finish(more(data, crc)),
		};
	}
}