// A minimal MP4 muxer: one video track, moov before mdat (+faststart), no audio. WebCodecs gives encoded samples only,
// and the dev machines have no ffmpeg (D-064). Pure: bytes in, bytes out.

const ascii = (text) => Uint8Array.from(text, (char) => char.charCodeAt(0));
const u8 = (value) => Uint8Array.of(value & 0xff);
const u16 = (value) => Uint8Array.of((value >>> 8) & 0xff, value & 0xff);
const u32 = (value) =>
  Uint8Array.of((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
const zeros = (length) => new Uint8Array(length);

export function concat(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

const box = (type, ...parts) => {
  const body = concat(parts);
  return concat([u32(body.length + 8), ascii(type), body]);
};
const fullBox = (type, version, flags, ...parts) =>
  box(type, u8(version), u8(flags >>> 16), u16(flags & 0xffff), ...parts);

const IDENTITY = concat([
  u32(0x00010000),
  u32(0),
  u32(0),
  u32(0),
  u32(0x00010000),
  u32(0),
  u32(0),
  u32(0),
  u32(0x40000000),
]);

/** Video sample entry (ISO 14496-12 §12.1.3) with its codec configuration box. */
function sampleEntry({ codec, width, height, config, colour }) {
  return box(
    codec,
    zeros(6),
    u16(1), // data_reference_index
    zeros(16), // pre_defined, reserved
    u16(width),
    u16(height),
    u32(0x00480000), // 72 dpi
    u32(0x00480000),
    u32(0),
    u16(1), // frame_count
    zeros(32), // compressorname
    u16(0x0018), // depth
    u16(0xffff), // pre_defined
    box(codec === 'avc1' ? 'avcC' : 'av1C', config),
    colour ? colourBox(colour) : zeros(0),
  );
}

/** `colr` of type nclx: the numbers of ISO/IEC 23091-2 (1 = BT.709, 13 = sRGB, 6 = BT.601). */
function colourBox({ primaries, transfer, matrix, fullRange }) {
  return box(
    'colr',
    ascii('nclx'),
    u16(primaries),
    u16(transfer),
    u16(matrix),
    u8(fullRange ? 0x80 : 0),
  );
}

function runLengths(values) {
  const runs = [];
  for (const value of values) {
    const last = runs.at(-1);
    if (last && last.value === value) last.count += 1;
    else runs.push({ value, count: 1 });
  }
  return runs;
}

function moov({ codec, width, height, timescale, samples, config, colour }, firstSampleOffset) {
  const durations = samples.map((sample) => sample.duration);
  const totalDuration = durations.reduce((sum, value) => sum + value, 0);
  const keys = samples.flatMap((sample, index) => (sample.key ? [index + 1] : []));
  const stts = runLengths(durations);
  const stbl = box(
    'stbl',
    fullBox('stsd', 0, 0, u32(1), sampleEntry({ codec, width, height, config, colour })),
    fullBox(
      'stts',
      0,
      0,
      u32(stts.length),
      ...stts.flatMap((run) => [u32(run.count), u32(run.value)]),
    ),
    fullBox('stss', 0, 0, u32(keys.length), ...keys.map(u32)),
    fullBox('stsc', 0, 0, u32(1), u32(1), u32(samples.length), u32(1)),
    fullBox(
      'stsz',
      0,
      0,
      u32(0),
      u32(samples.length),
      ...samples.map((sample) => u32(sample.data.length)),
    ),
    fullBox('stco', 0, 0, u32(1), u32(firstSampleOffset)),
  );
  const minf = box(
    'minf',
    fullBox('vmhd', 0, 1, zeros(8)),
    box('dinf', fullBox('dref', 0, 0, u32(1), fullBox('url ', 0, 1))),
    stbl,
  );
  const mdia = box(
    'mdia',
    fullBox('mdhd', 0, 0, u32(0), u32(0), u32(timescale), u32(totalDuration), u16(0x55c4), u16(0)),
    fullBox('hdlr', 0, 0, u32(0), ascii('vide'), zeros(12), ascii('VideoHandler'), u8(0)),
    minf,
  );
  const tkhd = fullBox(
    'tkhd',
    0,
    3, // enabled, in movie
    u32(0),
    u32(0),
    u32(1),
    u32(0),
    u32(totalDuration),
    zeros(8),
    u16(0),
    u16(0),
    u16(0),
    u16(0),
    IDENTITY,
    u32(width * 65536),
    u32(height * 65536),
  );
  const mvhd = fullBox(
    'mvhd',
    0,
    0,
    u32(0),
    u32(0),
    u32(timescale),
    u32(totalDuration),
    u32(0x00010000),
    u16(0x0100),
    zeros(10),
    IDENTITY,
    zeros(24),
    u32(2),
  );
  return box('moov', mvhd, box('trak', tkhd, mdia));
}

/**
 * @param track.codec 'avc1' | 'av01'
 * @param track.config the payload of avcC / av1C
 * @param track.samples [{ data: Uint8Array, key: boolean, duration: number (in timescale) }], in decode = display order
 */
export function muxMp4(track) {
  if (track.samples.length === 0) throw new Error('No samples to mux');
  const ftyp = box(
    'ftyp',
    ascii('isom'),
    u32(0x200),
    ascii('isom'),
    ascii('iso2'),
    ascii(track.codec === 'avc1' ? 'avc1' : 'av01'),
    ascii('mp41'),
  );
  // moov's size does not depend on the offset it holds: measured with 0, then written with the real one.
  const moovSize = moov(track, 0).length;
  const mdatHeader = 8;
  const firstSample = ftyp.length + moovSize + mdatHeader;
  const payload = concat(track.samples.map((sample) => sample.data));
  return concat([
    ftyp,
    moov(track, firstSample),
    u32(payload.length + mdatHeader),
    ascii('mdat'),
    payload,
  ]);
}

/** LEB128 of AV1 (`obu_size`): { value, length }. */
function leb128(bytes, start) {
  let value = 0;
  for (let index = 0; index < 8; index += 1) {
    const byte = bytes[start + index];
    value += (byte & 0x7f) * 2 ** (7 * index);
    if ((byte & 0x80) === 0) return { value, length: index + 1 };
  }
  throw new Error('Bad LEB128 in an AV1 stream');
}

/** The OBUs of one AV1 temporal unit: [{ type, start, end }]. Every OBU must carry its size (WebCodecs' do). */
export function av1Obus(bytes) {
  const obus = [];
  let cursor = 0;
  while (cursor < bytes.length) {
    const header = bytes[cursor];
    const type = (header >> 3) & 0x0f;
    const extension = (header >> 2) & 1;
    const hasSize = (header >> 1) & 1;
    if (!hasSize) throw new Error('AV1 OBU without a size field');
    const headerLength = 1 + extension;
    const size = leb128(bytes, cursor + headerLength);
    const end = cursor + headerLength + size.length + size.value;
    obus.push({ type, start: cursor, end });
    cursor = end;
  }
  return obus;
}

const OBU_SEQUENCE_HEADER = 1;
const OBU_TEMPORAL_DELIMITER = 2;

/** ISO-BMFF AV1 samples carry no temporal delimiters (AV1-ISOBMFF §2.4). */
export function stripTemporalDelimiters(bytes) {
  const kept = av1Obus(bytes).filter((obu) => obu.type !== OBU_TEMPORAL_DELIMITER);
  return concat(kept.map((obu) => bytes.subarray(obu.start, obu.end)));
}

/** The av1C payload for an 8-bit 4:2:0 stream: the fields of the codec string + the sequence header OBU. */
export function av1Config(firstTemporalUnit, { profile, level, tier }) {
  const sequence = av1Obus(firstTemporalUnit).find((obu) => obu.type === OBU_SEQUENCE_HEADER);
  if (!sequence) throw new Error('The first AV1 temporal unit has no sequence header');
  return concat([
    Uint8Array.of(
      0x81, // marker, version 1
      (profile << 5) | level,
      (tier << 7) | 0b0000_1100, // 8 bit, not monochrome, 4:2:0
      0,
    ),
    firstTemporalUnit.subarray(sequence.start, sequence.end),
  ]);
}
