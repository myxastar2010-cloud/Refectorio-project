import { describe, expect, it } from 'vitest';
import { av1Config, av1Obus, concat, muxMp4, stripTemporalDelimiters } from './mp4.mjs';

const samples = [
  { data: Uint8Array.of(1, 2, 3), key: true, duration: 1 },
  { data: Uint8Array.of(4, 5), key: false, duration: 1 },
  { data: Uint8Array.of(6), key: false, duration: 1 },
];
const track = {
  codec: 'avc1',
  width: 800,
  height: 700,
  timescale: 24,
  config: Uint8Array.of(9, 9),
  colour: { primaries: 1, transfer: 13, matrix: 1, fullRange: false },
  samples,
};

const text = (bytes, start, length) =>
  String.fromCharCode(...bytes.subarray(start, start + length));
const read32 = (bytes, at) =>
  ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;

/** Offset of the first box of this type, anywhere in the file. */
function find(bytes, type) {
  for (let index = 4; index + 4 <= bytes.length; index += 1) {
    if (text(bytes, index, 4) === type) return index - 4;
  }
  return -1;
}

describe('muxMp4', () => {
  const file = muxMp4(track);

  it('puts ftyp first and moov before mdat (+faststart)', () => {
    expect(text(file, 4, 4)).toBe('ftyp');
    const moov = find(file, 'moov');
    const mdat = find(file, 'mdat');
    expect(moov).toBeGreaterThan(0);
    expect(mdat).toBeGreaterThan(moov);
    expect(moov + read32(file, moov)).toBe(mdat);
    expect(mdat + read32(file, mdat)).toBe(file.length);
  });

  it('points the chunk offset at the first sample', () => {
    const stco = find(file, 'stco');
    const offset = read32(file, stco + 16);
    expect([...file.subarray(offset, offset + 6)]).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('keeps the sample table: sizes, one run of durations, the key frame', () => {
    const stsz = find(file, 'stsz');
    expect(read32(file, stsz + 16)).toBe(3);
    expect([20, 24, 28].map((at) => read32(file, stsz + at))).toEqual([3, 2, 1]);
    const stts = find(file, 'stts');
    expect(read32(file, stts + 12)).toBe(1);
    expect(read32(file, stts + 16)).toBe(3);
    const stss = find(file, 'stss');
    expect(read32(file, stss + 12)).toBe(1);
    expect(read32(file, stss + 16)).toBe(1);
  });

  it('writes the size and the colour of the track', () => {
    const tkhd = find(file, 'tkhd');
    expect(read32(file, tkhd + 84) / 65536).toBe(800);
    expect(read32(file, tkhd + 88) / 65536).toBe(700);
    expect(find(file, 'avcC')).toBeGreaterThan(0);
    const colr = find(file, 'colr');
    expect(text(file, colr + 8, 4)).toBe('nclx');
  });

  it('refuses an empty track', () => {
    expect(() => muxMp4({ ...track, samples: [] })).toThrow();
  });
});

describe('AV1 samples', () => {
  const delimiter = Uint8Array.of(0b0001_0010, 0);
  const sequence = Uint8Array.of(0b0000_1010, 3, 7, 8, 9);
  const frame = Uint8Array.of(0b0011_0010, 2, 5, 6);
  const unit = concat([delimiter, sequence, frame]);

  it('walks the OBUs by their sizes', () => {
    expect(av1Obus(unit).map((obu) => obu.type)).toEqual([2, 1, 6]);
  });

  it('drops the temporal delimiters only', () => {
    expect([...stripTemporalDelimiters(unit)]).toEqual([...sequence, ...frame]);
  });

  it('builds av1C from the codec fields and the sequence header', () => {
    const config = av1Config(unit, { profile: 0, level: 5, tier: 0 });
    expect([...config.subarray(0, 4)]).toEqual([0x81, 5, 0b0000_1100, 0]);
    expect([...config.subarray(4)]).toEqual([...sequence]);
  });

  it('needs a sequence header', () => {
    expect(() => av1Config(frame, { profile: 0, level: 5, tier: 0 })).toThrow();
  });
});
