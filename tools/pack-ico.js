// 把 256x256 的 PNG 封装成单尺寸 ICO（Windows 支持 PNG 压缩的图标条目）
const fs = require('fs');
const path = require('path');

const buildDir = path.join(__dirname, '..', 'build');
const png = fs.readFileSync(path.join(buildDir, 'icon.png'));

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(1, 4); // count

const entry = Buffer.alloc(16);
entry.writeUInt8(0, 0); // width 256
entry.writeUInt8(0, 1); // height 256
entry.writeUInt8(0, 2); // palette
entry.writeUInt8(0, 3); // reserved
entry.writeUInt16LE(1, 4); // color planes
entry.writeUInt16LE(32, 6); // bits per pixel
entry.writeUInt32LE(png.length, 8);
entry.writeUInt32LE(22, 12); // offset

fs.writeFileSync(path.join(buildDir, 'icon.ico'), Buffer.concat([header, entry, png]));
console.log('icon.ico written:', png.length, 'bytes png');
