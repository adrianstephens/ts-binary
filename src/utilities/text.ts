import { TypedArray, make, as } from './typedArray'

//-----------------------------------------------------------------------------
//	text
//-----------------------------------------------------------------------------

export type Encoding = 'latin1' | 'utf8' | 'utf16le' | 'utf16be' | 'utf32le' | 'utf32be';
export const bytesPerCharacter: Record<Encoding, number> = {
	latin1: 1,
	utf8: 1,
	utf16le: 2,
	utf16be: 2,
	utf32le: 4,
	utf32be: 4
};

export function stringCode(s: string) {
	let r = 0;
	for (let i = 0; i < s.length; i++)
		r += s.charCodeAt(i) << (i * 8);
	return r;
}
export function stringCodeBig(s: string) {
	let r = 0n;
	for (let i = 0; i < s.length; i++)
		r += BigInt(s.charCodeAt(i)) << BigInt(i * 8);
	return r;
}

export function encode(str: string, encoding: Encoding = 'utf8', bom = false): Uint8Array {
	if (encoding === 'latin1') {
		const buf = new Uint8Array(str.length);
		for (let i = 0; i < str.length; i++)
			buf[i] = str.charCodeAt(i) & 0xFF;
		return buf;
	}

	if (bom)
		str = String.fromCharCode(0xfeff) + str;

	if (encoding === 'utf8') {
		return new TextEncoder().encode(str);

	} else if (encoding === 'utf16le' || encoding === 'utf16be') {
		const len	= str.length;
		const view	= make(len, 'Uint16', encoding === 'utf16be');
		for (let i = 0; i < len; i++)
			view[i] = str.charCodeAt(i) as number;
		return new Uint8Array(view);

	} else {
		const chars = Array.from(str);
		const len	= chars.length;
		const view	= make(len, 'Uint32', encoding === 'utf32be');
		for (let i = 0; i < len; i++)
			view[i] = chars[i].codePointAt(0) as number;
		return new Uint8Array(view);
	}
}

function textView(buf: TypedArray<number>, encoding: Encoding) {
	return as(buf,
		encoding === 'utf8' || encoding === 'latin1' ? 'Uint8' : encoding === 'utf16le' || encoding === 'utf16be' ? 'Uint16' : 'Uint32',
		encoding === 'utf16be' || encoding === 'utf32be'
	);
}

function _decode(view: TypedArray<number>): string {
	let result = '';
	for (let i = 0; i < view.length; i += 8192)
		result += String.fromCodePoint(...view.subarray(i, i + 8192));
	return result;
}

export function decode(buf: TypedArray<number> | null, encoding: Encoding|'unknown' = 'utf8'): string {
	if (!buf)
		return '';
	if (encoding === 'unknown')
		encoding = guessEncoding(new Uint8Array(buf.buffer, buf.byteOffset, Math.min(buf.byteLength, 256)));
	return encoding === 'utf8'
		? new TextDecoder('utf-8').decode(buf)
		: _decode(textView(buf, encoding));
}

export function decodeToNull(buf: TypedArray<number> | undefined, encoding: Encoding|'unknown' = 'utf8'): string {
	if (!buf)
		return'';
	
	if (encoding === 'unknown')
		encoding = guessEncoding(new Uint8Array(buf.buffer, buf.byteOffset, Math.min(buf.byteLength, 256)));
	const view		= textView(buf, encoding);
	const zeroIndex = view.indexOf(0);
	const sub		= zeroIndex < 0 ? view : view.subarray(0, zeroIndex);

	return encoding === 'utf8'
		? new TextDecoder('utf-8').decode(sub)
		: _decode(sub);
}

const enc_masks2: (Encoding | '')[] = [
	'',			//0000
	'',			//0001
	'',			//0010
	'',			//0011
	'',			//0100
	'utf16be',	//0101	even lanes are zero
	'',			//0110
	'utf32be',	//0111	lanes 0,1,2 are zero; lane 3 carries the codepoint LSB
	'',			//1000
	'',			//1001
	'utf16le',	//1010	odd lanes are zero
	'',			//1011
	'',	//1100
	'',			//1101
	'utf32le',	//1110	lanes 1,2,3 are zero; lane 0 carries the codepoint LSB
	'',			//1111
];
export function guessEncoding(bytes: Uint8Array): Encoding {
    const nullAt  = [0, 0, 0, 0];
    for (let i = 0; i < bytes.length; i++)
        if (bytes[i] === 0)
            nullAt[i & 3]++;

	const hiThreshold = bytes.length / 4 * .6;
	const loThreshold = bytes.length / 4 * .1;

	let los = 0, his = 0;
	for (let i = 0; i < 4; i++) {
		his |= Number(nullAt[i] > hiThreshold) << i;
		los |= Number(nullAt[i] < loThreshold) << i;
	}

	if ((his | los) === 15 && enc_masks2[his])
		return enc_masks2[his] as Encoding;

	return new TextDecoder('utf-8').decode(bytes).includes('\uFFFD')
		? 'latin1' : 'utf8';
}

const boms: Partial<Record<Encoding, number[]>> = {
	utf8: [0xEF, 0xBB, 0xBF],
	utf16le: [0xFF, 0xFE],
	utf16be: [0xFE, 0xFF],
	utf32le: [0xFF, 0xFE, 0x00, 0x00],
	utf32be: [0x00, 0x00, 0xFF, 0xFE],
};
export function getEncoding(bytes: Uint8Array): Encoding {
	for (const i in boms) {
		const bom = boms[i as Encoding]!;
		if (bytes.length >= bom.length && bom.every((b, j) => bytes[j] === b))
			return i as Encoding;
	}
	return guessEncoding(bytes);
}
