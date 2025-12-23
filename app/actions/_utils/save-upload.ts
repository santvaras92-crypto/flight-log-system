'use server';

import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { uploadToR2 } from '@/lib/r2-storage';

// Plain upload payload (base64 string only)
export interface PlainUpload {
  name: string;
  base64: string; // raw base64 WITHOUT data url prefix
}

export async function saveUpload(file: PlainUpload, subdir: 'fuel' | 'deposit') {
  const buf = Buffer.from(file.base64, 'base64');
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const name = `${Date.now()}-${randomUUID()}.${ext}`;
  const key = `${subdir}/${name}`;

  const contentType =
    ext === 'png' ? 'image/png' :
    ext === 'webp' ? 'image/webp' :
    ext === 'pdf' ? 'application/pdf' :
    'image/jpeg';

  // Save to Railway volume (persistent) or public folder (local dev)
  const baseDir = process.env.RAILWAY_VOLUME_MOUNT_PATH 
    ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, subdir)
    : path.join(process.cwd(), 'public', 'uploads', subdir);
  
  await fs.mkdir(baseDir, { recursive: true });
  const full = path.join(baseDir, name);
  await fs.writeFile(full, buf);
  
  console.log(`[Storage] Saved ${key} to ${full}`);

  // Best effort R2 upload; keep local copy for durability
  const uploaded = await uploadToR2({
    key,
    contentType,
    body: buf,
  });

  if (uploaded) {
    console.log(`[R2] Uploaded ${key}`);
  }

  // Return API endpoint URL
  return `/api/uploads/fuel-image?key=${encodeURIComponent(key)}`;
}
