// Simple script to generate PNG icons using raw PNG bytes
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function createPNG(size, r, g, b) {
  // PNG signature
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const t = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.concat([t, data]);
    let crc = 0xffffffff;
    for (const byte of crcBuf) {
      crc ^= byte;
      for (let i = 0; i < 8; i++)
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    crc = (~crc) >>> 0;
    const crcOut = Buffer.alloc(4);
    crcOut.writeUInt32BE(crc, 0);
    return Buffer.concat([len, t, data, crcOut]);
  }

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 2;  // color type RGB
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  // Build raw pixel data (filter byte 0 per row + RGB pixels)
  const rowSize = 1 + size * 3;
  const raw = Buffer.alloc(size * rowSize);
  for (let y = 0; y < size; y++) {
    const offset = y * rowSize;
    raw[offset] = 0; // filter none
    for (let x = 0; x < size; x++) {
      const px = offset + 1 + x * 3;
      // Draw a simple circle in the middle
      const cx = size / 2, cy = size / 2, radius = size * 0.4;
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (dist <= radius) {
        raw[px] = r; raw[px + 1] = g; raw[px + 2] = b;
      } else {
        raw[px] = 15; raw[px + 1] = 15; raw[px + 2] = 26; // dark bg
      }
    }
  }

  const compressed = zlib.deflateSync(raw);
  const idat = chunk('IDAT', compressed);
  const iend = chunk('IEND', Buffer.alloc(0));
  const ihdr = chunk('IHDR', ihdrData);

  return Buffer.concat([sig, ihdr, idat, iend]);
}

const outDir = path.join(__dirname);
const sizes = [16, 48, 128];

// Purple color #6c63ff = rgb(108, 99, 255)
sizes.forEach(size => {
  const png = createPNG(size, 108, 99, 255);
  const file = path.join(outDir, `icon${size}.png`);
  fs.writeFileSync(file, png);
  console.log(`Created icon${size}.png`);
});

console.log('All icons created!');
