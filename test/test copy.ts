import * as bin from '../dist/binary';
import * as fs from 'fs/promises';

import { float16 } from '../dist/utils';

const custom = {
	get(s: bin._stream) {
		return s.view(bin.utils.Uint16beArray, 8);
	},
	put(s: bin._stream, v: InstanceType<typeof bin.utils.Uint16beArray>) {
		s.view(bin.utils.Uint16beArray, 8).set(v);
	}
};

interface Backing {
	readAt(offset: number, data: Uint8Array): Promise<number>;
	writeAt(offset: number, data: Uint8Array): Promise<void>;
}

class FileBacking implements Backing {
	private fd;

	constructor(filename: string) {
		this.fd = fs.open(filename, fs.constants.O_RDWR | fs.constants.O_CREAT);
	}
	async readAt(offset: number, data: Uint8Array) : Promise<number> {
		const fd = await this.fd;
		const read = await fd.read(data, 0, data.length, offset);
		return read.bytesRead;
		//return data.length;
	}
	async writeAt(offset: number, data: Uint8Array) {
		const fd = await this.fd;
		await fd.write(data, 0, data.length, offset);
	}

	async close() {
		const fd = await this.fd;
		await fd.close();
	}
}

(async () => {


	const file = new FileBacking('test.bin');

	const asyncs = new bin.async.stream(
		file.readAt.bind(file),
		file.writeAt.bind(file)
	);

	for (let i = 0; i < 1024; i++) {
		await bin.async.write(asyncs, bin.UINT32, 0x12345678);

	}
	await asyncs.terminate();

	asyncs.seek(0);
	const data0 = await asyncs.remainder();
	console.log(data0.toString());

	await file.close();

	const x = float16(1.5);
	const y = +x + +x;

	const spec = {
		s: bin.NullTerminatedStringType('utf8'),
		e: bin.Buffer(8, bin.utils.Uint16beArray),
		a: bin.UINT32,
		b: bin.UINT32,
		c: bin.UINT32,
		d: bin.UINT32,
	};
	const specdata = {
		s: 'Hello, world!',
		a: 0x12345678,
		b: 0x12345678,
		c: 0x12345678,
		d: 0x12345678,
		e: new Uint16Array([0x1234, 0x5678, 0x9abc, 0xdef0]),
	};

	const s = new bin.growingStream();
	bin.write(s, spec, specdata);
	const data = s.terminate();

	const s2 = new bin.stream(data);
	const data2 = bin.read(s2, spec);

	console.log(data2.toString());

	const s3 = new bin.stream(data);
	const data3 = bin.read(s3, bin.Buffer(4, bin.utils.FloatTypedArray(bin.utils.float16)));
	console.log(data3.toString());


})().catch(err => {
	console.error('Error:', err);
	process.exit(1);
});
