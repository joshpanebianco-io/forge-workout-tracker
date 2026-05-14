import sharp from 'sharp'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const publicDir = join(here, '..', 'public')

const svg = await readFile(join(publicDir, 'pwa-512.svg'))

const targets = [
  { out: 'pwa-192.png', size: 192 },
  { out: 'pwa-512.png', size: 512 },
  { out: 'apple-touch-icon.png', size: 180 },
  { out: 'apple-touch-icon-precomposed.png', size: 180 },
]

for (const { out, size } of targets) {
  const buf = await sharp(svg, { density: 384 })
    .resize(size, size, { fit: 'cover' })
    .png()
    .toBuffer()
  await writeFile(join(publicDir, out), buf)
  console.log(`wrote ${out} (${size}x${size}, ${buf.length} bytes)`)
}
