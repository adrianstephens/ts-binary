
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
