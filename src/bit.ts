import * as async from './async';
import * as sync from './sync';
import * as interop from './interop';
import * as common from './common';
import { BitsType, MaybePromise, ReadType, after } from './common';
import { TypedArrayLike, ViewMaker } from './utilities/typedArray';

export function getUint(dv: DataView, offset: number, len: number, littleEndian?: boolean) {
	const pad0 = offset & 7;
	const end = len + pad0;
	if (end >= 32)
		return Number(getBigUint(dv, offset, len, littleEndian));
	
	const x = common.getUint(dv, offset >> 3, (end + 7) >> 3, littleEndian);
	return (littleEndian ? (x >> pad0) : (x >> ((8 - end) & 7))) & ((1 << len) - 1);
}

export function putUint(dv: DataView, offset: number, v: number, len: number, littleEndian?: boolean) {
	const pad0	= offset & 7;
	const end	= len + pad0;
	if (end >= 32)
		return putBigUint(dv, offset, BigInt(v), len, littleEndian);

	const boffset	= offset >> 3;
	const blast		= (end - 1) >> 3;
	const pad1		= end & 7;

	v &= (1 << len) - 1;
	if (littleEndian) {
		if (pad0)
			v = (v << pad0) | (dv.getUint8(boffset) & (0xff >> (8 - pad0)));
		if (pad1)
			v |= (dv.getUint8(boffset + blast) & (0xff << pad1)) << (blast << 3);
	} else {
		if (pad1)
			v = (v << (8 - pad1)) | (dv.getUint8(boffset + blast) & (0xff >> pad1));
		if (pad0)
			v |= (dv.getUint8(boffset) & (0xff << (8 - pad0))) << (blast << 3);
	}

	common.putUint(dv, boffset, v, blast + 1, littleEndian);
}

export function getBigUint(dv: DataView, offset: number, len: number, littleEndian?: boolean) {
	const end = (offset & 7) + len;
	const x = common.getBigUint(dv, offset >> 3, (end + 7) >> 3, littleEndian);
	return (littleEndian ? (x >> BigInt(offset & 7)) : (x >> BigInt((8 - end) & 7))) & ((1n << BigInt(len)) - 1n);
}

export function putBigUint(dv: DataView, offset: number, v: bigint, len: number, littleEndian?: boolean) {
	const pad0	= offset & 7;
	const end	= len + pad0;

	const boffset	= offset >> 3;
	const blast		= (end - 1) >> 3;
	const pad1		= end & 7;

	v &= (1n << BigInt(len)) - 1n;
	if (littleEndian) {
		if (pad0)
			v = (v << BigInt(pad0)) | (BigInt(dv.getUint8(boffset) & (0xff >> (8 - pad0))));
		if (pad1)
			v |= BigInt(dv.getUint8(boffset + blast) & (0xff << pad1)) << BigInt(blast << 3);
	} else {
		if (pad1)
			v = (v << BigInt(8 - pad1)) | (BigInt(dv.getUint8(boffset + blast) & (0xff >> pad1)));
		if (pad0)
			v |= BigInt(dv.getUint8(boffset) & (0xff << (8 - pad0))) << BigInt(blast << 3);
	}

	common.putBigUint(dv, boffset, v, blast + 1, littleEndian);
}

//-----------------------------------------------------------------------------
//	stream
//-----------------------------------------------------------------------------

function shiftBuffer(buff: Uint8Array, shift: number, be?: boolean) {
	if (shift === 0)
		return buff;

	const bytes		= buff.byteLength - 1;
	const shifted	= new Uint8Array(bytes);
	if (be) {
		for (let i = 0; i < bytes; i++)
			shifted[i] = ((buff[i] << 8) | buff[i + 1]) >> (8 - shift);	
	} else {
		for (let i = 0; i < bytes; i++)
			shifted[i] = ((buff[i] | (buff[i + 1] << 8)) >> shift);
	}
	return shifted;
}

function unshiftBuffer(aligned: Uint8Array, shift: number, dst: Uint8Array, be?: boolean) {
	if (shift === 0) {
		dst.set(aligned);
		return;
	}

	const inv = 8 - shift;
	if (be) {
		dst[0] = (dst[0] & (0xff << inv)) | (aligned[0] >> shift);
		for (let i = 1; i < aligned.length; i++)
			dst[i] = (aligned[i - 1] << inv) | (aligned[i] >> shift);
		dst[aligned.length] = (aligned[aligned.length - 1] << inv) | (dst[aligned.length] & (0xff >> shift));
	} else {
		dst[0] = (dst[0] & (0xff >> inv)) | (aligned[0] << shift);
		for (let i = 1; i < aligned.length; i++)
			dst[i] = (aligned[i] << shift) | (aligned[i - 1] >> inv);
		dst[aligned.length] = (dst[aligned.length] & (0xff << shift)) | (aligned[aligned.length - 1] >> inv);
	}
}

export class sync_stream extends sync._stream /*implements _stream*/ {
	private pending_offset	= 0;
	private pending_aligned?: Uint8Array;

	constructor(viewDelegate: sync.viewDelegate, offset: number, end?: number, be?: boolean, obj?: any) {
		super(viewDelegate, offset, end, be, obj);
		this.offset = offset << 3;
	}
	tell() 					{ return this.offset - (this.offset0 * 8); }
	seek(offset: number) 	{ this.flush_pending(); this.offset = this.offset0 * 8 + offset; }
	skip(len: number) 		{ this.flush_pending(); this.offset += len; }

	flush_pending() {
		const aligned = this.pending_aligned;
		if (aligned) {
			this.pending_aligned = undefined;
			const bit0	= this.pending_offset & 7;
			const dst	= this.view_absolute(Uint8Array, this.pending_offset >> 3, bit0 ? aligned.length + 1 : aligned.length);
			unshiftBuffer(aligned, bit0, dst, this.be);
		}
	}

	view_at<T extends TypedArrayLike>(type: ViewMaker<T>, offset: number, len: number) {
		this.flush_pending();
		return this.view_absolute(type, this.offset0 + offset, len);
	}

	view<T extends TypedArrayLike>(type: ViewMaker<T>, len: number, strict = true): T {
		this.flush_pending();
		const bytesPerElement	= type.BYTES_PER_ELEMENT || 1;
		const byteLength		= len * bytesPerElement;
		const bit				= this.offset & 7;

		if (!bit) {
			const b	= this.view_absolute(type, this.offset >> 3, len);
			if (strict && b.byteLength < byteLength)
				throw new Error('stream: out of bounds');
			this.offset += b.byteLength << 3;
			return b;
		}

		const buff	= this.view_absolute(Uint8Array, this.offset >> 3, ((this.offset & 7) + (byteLength << 3) + 7) >> 3);
		const b		= shiftBuffer(buff, this.offset & 7, this.be);

		if (strict && b.byteLength < byteLength)
			throw new Error('stream: out of bounds');

		this.pending_offset		= this.offset;
		this.pending_aligned	= b;
		this.offset += byteLength << 3;
		return new type(b.buffer, 0, len);
	}
}

export class async_stream extends async._stream /*implements _stream*/ {
	private pending_offset	= 0;
	private pending_aligned?: Uint8Array;

	constructor(viewDelegate: async.viewDelegate, offset: number, end?: number, be?: boolean, obj?: any) {
		super(viewDelegate, offset, end, be, obj);
		this.offset = offset << 3;
	}
	tell() 					{ return this.offset - (this.offset0 << 3); }
	seek(offset: number) 	{ this.offset = (this.offset0 << 3) + offset; }

	async flush_pending() {
		const aligned = this.pending_aligned;
		if (!aligned)
			return;
		this.pending_aligned = undefined;
		const bit0	= this.pending_offset & 7;
		const dst	= await this.view_absolute(Uint8Array, this.pending_offset >> 3, bit0 ? aligned.length + 1 : aligned.length);
		unshiftBuffer(aligned, bit0, dst, this.be);
	}

	async view_at<T extends TypedArrayLike>(type: ViewMaker<T>, offset: number, len: number) {
		await this.flush_pending();
		return this.view_absolute(type, this.offset0 + offset, len);
	}

	async view<T extends TypedArrayLike>(type: ViewMaker<T>, len: number, strict = true): Promise<T> {
		await this.flush_pending();
		const bytesPerElement	= type.BYTES_PER_ELEMENT || 1;
		const byteLength		= len * bytesPerElement;
		const bit				= this.offset & 7;

		if (!bit) {
			const b = await this.view_absolute(type, this.offset >> 3, len);
			if (strict && b.byteLength < byteLength)
				throw new Error('stream: out of bounds');
			this.offset += b.byteLength << 3;
			return b;
		}

		const buff	= await this.view_absolute(Uint8Array, this.offset >> 3, ((this.offset & 7) + (byteLength << 3) + 7) >> 3);
		const b		= shiftBuffer(buff, this.offset & 7, this.be);

		if (strict && b.byteLength < byteLength)
			throw new Error('stream: out of bounds');

		this.pending_offset		= this.offset;
		this.pending_aligned	= b;
		this.offset += byteLength << 3;
		return new type(b.buffer, 0, len);
	}
}

//-----------------------------------------------------------------------------
//	Types
//-----------------------------------------------------------------------------

type _stream = sync._stream | async._stream;

interface TypeT<T> {
	get(s: _stream): MaybePromise<T>;
	put(s: _stream, v: T): MaybePromise<void>;
}

type Type = TypeT<any> | { [key: string]: Type } | readonly TypeT<any>[] | interop.Type;

export function WithBits<T extends Type>(type: T): interop.TypeT<ReadType<T>> {
	return {
		get: ((s: sync._stream | async._stream) => {
			if (s.kind === 'sync') {
				const s2 = s.subStream(sync_stream);
				const result = s2.read(type as any);
				s2.flush_pending();
				s.skip((s2.tell() + 7) >> 3);
				return result;
			} else {
				const s2 = s.subStream(async_stream);
				return after(s2.read(type as any), result => after(s2.flush_pending(), () => {
					s.skip((s2.tell() + 7) >> 3);
					return result;
				}));
			}
		}) as any,
		put: ((s: sync._stream | async._stream, v: ReadType<T>) => {
			if (s.kind === 'sync') {
				const s2 = s.subStream(sync_stream);
				s2.write(type as any, v);
				s2.flush_pending();
				s.skip((s2.tell() + 7) >> 3);
			} else {
				const s2 = s.subStream(async_stream);
				return after(s2.write(type as any, v), () =>
					after(s2.flush_pending(), () => s.skip((s2.tell() + 7) >> 3))
				);
			}
		}) as any,
	};
}

export const Bit = {
	get(s: _stream) {
		const pos = s.tell();
		return after(s.view_at(DataView, pos >> 3, 1), dv => {
			s.skip(1);
			return !!getUint(dv, pos & 7, 1, !s.be);
		});
	},
	put(s: _stream, v: boolean) {
		const pos = s.tell();
		return after(s.view_at(DataView, pos >> 3, 1), dv => {
			putUint(dv, pos & 7, v ? 1 : 0, 1, !s.be);
			s.skip(1);
		});
	}
} as TypeT<boolean>;

function readBitsN(s: _stream, n: number) {
	const pos = s.tell();
	return after(s.view_at(DataView, pos >> 3, ((pos & 7) + n + 7) >> 3), dv => {
		s.skip(n);
		return getUint(dv, pos & 7, n, !s.be);
	});
}
function writeBitsN(s: _stream, n: number, v: number) {
	const pos = s.tell();
	return after(s.view_at(DataView, pos >> 3, ((pos & 7) + n + 7) >> 3), dv => {
		putUint(dv, pos & 7, v, n, !s.be);
		s.skip(n);
	});
}
function readBitsB(s: _stream, n: number) {
	const pos = s.tell();
	return after(s.view_at(DataView, pos >> 3, ((pos & 7) + n + 7) >> 3), dv => {
		s.skip(n);
		return getBigUint(dv, pos & 7, n, !s.be);
	});
}
function writeBitsB(s: _stream, n: number, v: bigint) {
	const pos = s.tell();
	return after(s.view_at(DataView, pos >> 3, ((pos & 7) + n + 7) >> 3), dv => {
		putBigUint(dv, pos & 7, v, n, !s.be);
		s.skip(n);
	});
}

export function Bits<N extends number>(n: N): TypeT<BitsType<N>>;
export function Bits(n: number): TypeT<number|bigint>;
export function Bits(n: interop.TypeX<number>): TypeT<number|bigint>;
export function Bits(n: interop.TypeX<number>) {
	if (typeof n === 'number') {
		return n <= 32 ? {
			get(s: _stream) { return readBitsN(s, n); },
			put(s: _stream, v: number) { return writeBitsN(s, n, v); }
		} : {
			get(s: _stream) { return readBitsB(s, n); },
			put(s: _stream, v: bigint) { return writeBitsB(s, n, v); }
		};
	} else {
		const n2 = interop.makex(n);
		return {
			get(s: _stream) { return after(n2.get(s as any), n => n <= 32 ? readBitsN(s, n) : readBitsB(s, n)); },
			put(s: _stream, v: number|bigint) { return after(n2.put(s as any, Number(v)), n => n <= 32 ? writeBitsN(s, n, Number(v)) : writeBitsB(s, n, BigInt(v))); }
		};
	}
}
