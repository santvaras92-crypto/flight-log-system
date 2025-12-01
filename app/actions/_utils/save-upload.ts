'use server';

import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

export async function saveUpload(file: File, subdir: 'fuel' | 'deposit') {
  const buf = Buffer.from(await file.arrayBuffer());
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const name = `${Date.now()}-${randomUUID()}.${ext}`;
  const dir = path.join(process.cwd(), 'public', 'uploads', subdir);
  await fs.mkdir(dir, { recursive: true });
  const full = path.join(dir, name);
  await fs.writeFile(full, buf);
  return `/uploads/${subdir}/${name}`;
}
