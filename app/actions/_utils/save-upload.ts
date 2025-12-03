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
  
  // Detect content type
  const contentTypeMap: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    pdf: 'application/pdf',
  };
  const contentType = contentTypeMap[ext] || 'application/octet-stream';

  // 1) Try R2 upload first
  const r2Url = await uploadToR2({ key, contentType, body: buf });
  if (r2Url) {
    console.log(`[R2] Uploaded ${key} → ${r2Url}`);
    return r2Url;
  }

  // 2) Fallback to local storage (Railway volume or public)
  const baseDir = process.env.RAILWAY_VOLUME_MOUNT_PATH 
    ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, subdir)
    : path.join(process.cwd(), 'public', 'uploads', subdir);
  
  await fs.mkdir(baseDir, { recursive: true });
  const full = path.join(baseDir, name);
  await fs.writeFile(full, buf);
  console.log(`[Local] Saved ${key} → /uploads/${subdir}/${name}`);
  return `/uploads/${subdir}/${name}`;
}
