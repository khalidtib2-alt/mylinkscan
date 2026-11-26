import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const root = new URL("../chrome-extension/", import.meta.url);
const destination = new URL("../dist/", import.meta.url);
const files = ["manifest.json", "background.js", "shared.js", "popup.html", "popup.css", "popup.js", "icon16.png", "icon48.png", "icon128.png"];

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const entries = await Promise.all(files.map(async (file) => ({ name: Buffer.from(file), data: await readFile(new URL(file, root)) })));
const archivePath = new URL("../dist/mylinkscan-extension.zip", import.meta.url);
const desktopPath = join(homedir(), "Desktop", "mylinkscan-extension.zip");
const local = [];
const directory = [];
let offset = 0;

for (const { name, data } of entries) {
  // A stored ZIP entry contains the raw file bytes and duplicate metadata in the central directory.
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(33, 12); // DOS date for 1980-01-01.
  header.writeUInt32LE(crc32(data), 14);
  header.writeUInt32LE(data.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(name.length, 26);
  local.push(header, name, data);

  const index = Buffer.alloc(46);
  index.writeUInt32LE(0x02014b50, 0);
  index.writeUInt16LE(20, 4);
  header.copy(index, 6, 4);
  index.writeUInt32LE(offset, 42);
  directory.push(index, name);
  offset += header.length + name.length + data.length;
}

const central = Buffer.concat(directory);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(central.length, 12);
end.writeUInt32LE(offset, 16);
const zip = Buffer.concat([...local, central, end]);
await mkdir(destination, { recursive: true });
await writeFile(archivePath, zip);
await mkdir(join(homedir(), "Desktop"), { recursive: true });
await writeFile(desktopPath, zip);
console.log("Created dist/mylinkscan-extension.zip");
console.log(`Copied ${desktopPath}`);
