import * as async from './async';
import * as sync from './sync';
import * as utils from './utils';
import { after, BitsType, MaybePromise, TypedArrayLike, ViewMaker } from './utils';
import { readx2, Type2, TypeT2, TypeX2, writex2 } from './types';

type ReadType<T> = sync.ReadType<T>;

//-----------------------------------------------------------------------------
//	stream
//-----------------------------------------------------------------------------

export interface _stream {
	readonly kind: 'sync' | 'async';
	be?: boolean;
	flush_pending(): MaybePromise<void>;
	tell_bit(): number;
	seek_bit(offset: number): void;
	skip_bit(offset: number): void;
	align_bit(align: number): void;

	view_at<T extends TypedArrayLike>(type: ViewMaker<T>, offset: number, len: number): MaybePromise<T>;
}

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

export class sync_stream extends sync._stream implements _stream {
	private pending_offset	= 0;
	private pending_aligned?: Uint8Array;

	constructor(viewDelegate: sync.viewDelegate, offset: number, end?: number, be?: boolean, obj?: any) {
		super(viewDelegate, offset, end, be, obj);
		this.offset = offset << 3;
	}
	tell() 							{ return (this.offset >> 3) - this.offset0; }
	seek(offset: number) 			{ this.flush_pending(); this.offset = (this.offset0 + offset) << 3; }
	skip(len: number) 				{ this.flush_pending(); this.offset += len << 3; }
	align(align: number) 			{ this.align_bit(align << 3); }
	tell_bit() 						{ return this.offset - (this.offset0 << 3); }
	seek_bit(offset: number) 		{ this.flush_pending(); this.offset = (this.offset0 << 3) + offset; }
	skip_bit(offset: number) 		{ this.flush_pending(); this.offset += offset; }
	align_bit(align: number) 		{
		this.flush_pending();
		const misalign = this.tell_bit() % align;
		if (misalign)
			this.skip_bit(align - misalign);
	}
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

		this.flush_pending();
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

export class async_stream extends async._stream implements _stream {
	private pending_offset	= 0;
	private pending_aligned?: Uint8Array;

	constructor(viewDelegate: async.viewDelegate, offset: number, end?: number, be?: boolean, obj?: any) {
		super(viewDelegate, offset, end, be, obj);
		this.offset = offset << 3;
	}
	tell() 							{ return (this.offset >> 3) - this.offset0; }
	seek(offset: number) 			{ this.offset = (this.offset0 + offset) << 3; }
	skip(len: number) 				{ this.offset += len << 3; }
	align(align: number) 			{ this.align_bit(align << 3); }
	tell_bit() 						{ return this.offset - (this.offset0 << 3); }
	seek_bit(offset: number) 		{ this.offset = (this.offset0 << 3) + offset; }
	skip_bit(offset: number) 		{ this.offset += offset; }
	align_bit(align: number) 		{
		const misalign = this.tell_bit() % align;
		if (misalign)
			this.skip_bit(align - misalign);
	}
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

		await this.flush_pending();
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

interface TypeT<T> {
	get(s: _stream): MaybePromise<T>;
	put(s: _stream, v: T): MaybePromise<void>;
}

type Type = TypeT<any> | { [key: string]: Type } | readonly TypeT<any>[] | Type2;

export function WithBits<T extends Type>(type: T): TypeT2<ReadType<T>> {
	return {
		get: ((s: sync._stream | async._stream) => {
			if (s.kind === 'sync') {
				const s2 = s.subStream(sync_stream);
				const result = s2.read(type as any);
				s2.flush_pending();
				s.skip(s2.tell());
				return result;
			} else {
				const s2 = s.subStream(async_stream);
				return after(s2.read(type as any), result => after(s2.flush_pending(), () => {
					s.skip(s2.tell());
					return result;
				}));
			}
		}) as any,
		put: ((s: sync._stream | async._stream, v: ReadType<T>) => {
			if (s.kind === 'sync') {
				const s2 = s.subStream(sync_stream);
				s2.write(type as any, v);
				s2.flush_pending();
				s.skip(s2.tell());
			} else {
				const s2 = s.subStream(async_stream);
				return after(s2.write(type as any, v), () =>
					after(s2.flush_pending(), () => s.skip(s2.tell()))
				);
			}
		}) as any,
	};
}

export const Bit = {
	get(s: _stream) {
		const pos = s.tell_bit();
		return after(s.view_at(DataView, pos >> 3, 1), dv => {
			s.skip_bit(1);
			return !!utils.getUintBits(dv, pos & 7, 1, !s.be);
		});
	},
	put(s: _stream, v: boolean) {
		const pos = s.tell_bit();
		return after(s.view_at(DataView, pos >> 3, 1), dv => {
			utils.putUintBits(dv, pos & 7, v ? 1 : 0, 1, !s.be);
			s.skip_bit(1);
		});
	}
} as TypeT<boolean>;

export function Bits<N extends number>(n: N): TypeT<BitsType<N>>;
export function Bits(n: number): TypeT<number|bigint>;
export function Bits(n: TypeX2<number>): TypeT<number|bigint>;
export function Bits(n: TypeX2<number>) {

	function readBitsN(s: _stream, n: number) {
		const pos = s.tell_bit();
		return after(s.view_at(DataView, pos >> 3, ((pos & 7) + n + 7) >> 3), dv => {
			s.skip_bit(n);
			return utils.getUintBits(dv, pos & 7, n, !s.be);
		});
	}
	function writeBitsN(s: _stream, n: number, v: number) {
		const pos = s.tell_bit();
		return after(s.view_at(DataView, pos >> 3, ((pos & 7) + n + 7) >> 3), dv => {
			utils.putUintBits(dv, pos & 7, v, n, !s.be);
			s.skip_bit(n);
		});
	}
	function readBitsB(s: _stream, n: number) {
		const pos = s.tell_bit();
		return after(s.view_at(DataView, pos >> 3, ((pos & 7) + n + 7) >> 3), dv => {
			s.skip_bit(n);
			return utils.getBigUintBits(dv, pos & 7, n, !s.be);
		});
	}
	function writeBitsB(s: _stream, n: number, v: bigint) {
		const pos = s.tell_bit();
		return after(s.view_at(DataView, pos >> 3, ((pos & 7) + n + 7) >> 3), dv => {
			utils.putBigUintBits(dv, pos & 7, v, n, !s.be);
			s.skip_bit(n);
		});
	}

	if (typeof n === 'number') {
		return n <= 32 ? {
			get(s: _stream) { return readBitsN(s, n); },
			put(s: _stream, v: number) { return writeBitsN(s, n, v); }
		} : {
			get(s: _stream) { return readBitsB(s, n); },
			put(s: _stream, v: bigint) { return writeBitsB(s, n, v); }
		};
	} else {
		return {
			get(s: _stream) { return after(readx2(s as any, n), n => n <= 32 ? readBitsN(s, n) : readBitsB(s, n)); },
			put(s: _stream, v: number|bigint) { return after(writex2(s as any, n, Number(v)), n => n <= 32 ? writeBitsN(s, n, Number(v)) : writeBitsB(s, n, BigInt(v))); }
		};
	}
}
