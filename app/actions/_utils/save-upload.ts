'use server';

import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

// Plain upload payload (base64 string only)
export interface PlainUpload {
  name: string;
  base64: string; // raw base64 WITHOUT data url prefix
}

export async function saveUpload(file: PlainUpload, subdir: 'fuel' | 'deposit') {
  const buf = Buffer.from(file.base64, 'base64');
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const name = `${Date.now()}-${randomUUID()}.${ext}`;
  
  // Use Railway volume in production, local public in dev
  const baseDir = process.env.RAILWAY_VOLUME_MOUNT_PATH 
    ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, subdir)
    : path.join(process.cwd(), 'public', 'uploads', subdir);
  
  await fs.mkdir(baseDir, { recursive: true });
  const full = path.join(baseDir, name);
  await fs.writeFile(full, buf);
  return `/uploads/${subdir}/${name}`;
}
