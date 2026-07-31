"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const bin = __importStar(require("../dist/index"));
const assert = __importStar(require("assert"));
const bit = __importStar(require("../dist/bit"));
const results = [];
function test(name, fn) {
    try {
        fn();
        results.push({ name, passed: true });
    }
    catch (e) {
        results.push({ name, passed: false, error: String(e) });
    }
}
async function testAsync(name, fn) {
    try {
        await fn();
        results.push({ name, passed: true });
    }
    catch (e) {
        results.push({ name, passed: false, error: String(e) });
    }
}
function createAsyncStream(source, be) {
    const s = new bin.async.stream(async (offset, data) => {
        const n = Math.max(0, Math.min(data.length, source.length - offset));
        for (let i = 0; i < n; i++)
            data[i] = source[offset + i];
        return n;
    }, undefined, undefined, source.length);
    if (be !== undefined)
        s.be = be;
    return s;
}
// LE sync tests
test('LE sync: 8 individual bits', () => {
    const s = new bin.stream(new Uint8Array([0b01010101]));
    const data = s.read(bit.WithBits({ a: bit.Bit, b: bit.Bit, c: bit.Bit, d: bit.Bit, e: bit.Bit, f: bit.Bit, g: bit.Bit, h: bit.Bit }));
    assert.deepEqual([data.a, data.b, data.c, data.d, data.e, data.f, data.g, data.h], [true, false, true, false, true, false, true, false]);
});
test('LE sync: 4/8/12 bits', () => {
    const s = new bin.stream(new Uint8Array([0xAF, 0xCD, 0x0B]));
    const data = s.read(bit.WithBits({ a: bit.Bits(4), b: bit.Bits(8), c: bit.Bits(12) }));
    assert.strictEqual(data.a, 0xF);
    assert.strictEqual(data.b, 0xDA);
    assert.strictEqual(data.c, 0x0BC);
});
test('LE sync: unaligned byte read', () => {
    const s = new bin.stream(new Uint8Array([0xFF, 0x55]));
    const data = s.read(bit.WithBits({ bit1: bit.Bit, byte1: bin.UINT8 }));
    assert.strictEqual(data.bit1, true);
    assert.strictEqual(data.byte1, 0xFF);
});
// BE sync tests
test('BE sync: 8 individual bits', () => {
    const s = new bin.stream(new Uint8Array([0b10101010]), true);
    const data = s.read(bit.WithBits({ a: bit.Bit, b: bit.Bit, c: bit.Bit, d: bit.Bit, e: bit.Bit, f: bit.Bit, g: bit.Bit, h: bit.Bit }));
    assert.deepEqual([data.a, data.b, data.c, data.d, data.e, data.f, data.g, data.h], [true, false, true, false, true, false, true, false]);
});
test('BE sync: three 4-bit fields', () => {
    const s = new bin.stream(new Uint8Array([0xF5, 0x30]), true);
    const data = s.read(bit.WithBits({ a: bit.Bits(4), b: bit.Bits(4), c: bit.Bits(4) }));
    assert.strictEqual(data.a, 0xF);
    assert.strictEqual(data.b, 0x5);
    assert.strictEqual(data.c, 0x3);
});
test('BE sync: unaligned byte read', () => {
    const s = new bin.stream(new Uint8Array([0xFF, 0x55]), true);
    const data = s.read(bit.WithBits({ bit1: bit.Bit, byte1: bin.UINT8 }));
    assert.strictEqual(data.bit1, true);
    assert.strictEqual(data.byte1, 0xFE);
});
test('LE sync: WithBits + Size substream bounds', () => {
    const root = new bin.stream(new Uint8Array([0, 1, 2, 3, 4, 5]));
    const bits = root.subStream(bit.sync_stream);
    bits.seek(3);
    assert.strictEqual(bits.tell(), 0);
    assert.strictEqual(bits.tell(), 3);
    assert.strictEqual(bits.remaining(), 6);
    const sub = bits.offsetStream(1, 2);
    assert.strictEqual(sub.tell(), 0);
    assert.strictEqual(sub.remaining(), 2);
    const s = new bin.stream(new Uint8Array([2, 0xAA, 0xBB, 0x7E]));
    const data = s.read(bit.WithBits({
        len: bin.UINT8,
        payload: bin.Size('len', { a: bin.UINT8, b: bin.UINT8 }),
        tail: bin.UINT8,
    }));
    assert.deepEqual(data, { len: 2, payload: { a: 0xAA, b: 0xBB }, tail: 0x7E });
});
(async () => {
    await testAsync('LE async: 8 individual bits', async () => {
        const s = createAsyncStream(new Uint8Array([0b01010101]), false);
        const data = await s.read(bit.WithBits({ a: bit.Bit, b: bit.Bit, c: bit.Bit, d: bit.Bit, e: bit.Bit, f: bit.Bit, g: bit.Bit, h: bit.Bit }));
        assert.deepEqual([data.a, data.b, data.c, data.d, data.e, data.f, data.g, data.h], [true, false, true, false, true, false, true, false]);
        await s.terminate();
    });
    await testAsync('BE async: mixed byte and bit aligned', async () => {
        const s = createAsyncStream(new Uint8Array([0x42, 0xAA]), true);
        const data = await s.read(bit.WithBits({ byte1: bin.UINT8, bit1: bit.Bit, bits4: bit.Bits(4), bits3: bit.Bits(3) }));
        assert.strictEqual(data.byte1, 0x42);
        assert.strictEqual(data.bit1, true);
        assert.strictEqual(data.bits4, 0x5);
        assert.strictEqual(data.bits3, 0x2);
        await s.terminate();
    });
    await testAsync('LE async: computed width from stream', async () => {
        const s = createAsyncStream(new Uint8Array([4, 4, 0x0F]), false);
        const data = await s.read(bit.WithBits({ width: bin.UINT8, value: bit.Bits(bin.UINT8) }));
        assert.strictEqual(data.width, 4);
        assert.strictEqual(data.value, 0xF);
        await s.terminate();
    });
    console.log('\n=== Test Results ===');
    for (const result of results) {
        const status = result.passed ? '✓' : '✗';
        console.log(`${status} ${result.name}${result.error ? `: ${result.error}` : ''}`);
    }
    const failed = results.filter(r => !r.passed);
    if (failed.length > 0) {
        console.log(`\n${failed.length}/${results.length} tests failed`);
        process.exit(1);
    }
    else {
        console.log(`\nAll ${results.length} tests passed`);
    }
})().catch(e => {
    console.error('Fatal error:', e);
    process.exit(1);
});
//# sourceMappingURL=test-bits.js.map