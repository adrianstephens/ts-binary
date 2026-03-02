import * as bin from '../dist/binary';

const custom = {
	get(s: bin._stream) {
		return s.view(bin.utils.Uint16beArray, 8);
	},
	put(s: bin._stream, v: InstanceType<typeof bin.utils.Uint16beArray>) {
		s.view(bin.utils.Uint16beArray, 8).set(v);
	}
};

(async () => {

	const x = new bin.utils.float16(1.5);
	const y = +x + +x;

	const s = new bin.growingStream();
	bin.write(s, bin.UINT32, 0x12345678);
	bin.write(s, bin.UINT32, 0x12345678);
	bin.write(s, bin.UINT32, 0x12345678);
	bin.write(s, bin.UINT32, 0x12345678);
	const data = s.terminate();

	const s2 = new bin.stream(data);
	const data2 = bin.read(s2, custom);

	console.log(data2.toString());

	const s3 = new bin.stream(data);
	const data3 = bin.read(s3, bin.Buffer(4, bin.utils.Float16Array));
	console.log(data3.toString());


})().catch(err => {
	console.error('Error:', err);
	process.exit(1);
});
