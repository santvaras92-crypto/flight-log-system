// rebuild 1765415217
// Railway rebuild fix - Dec 7, 2025
'use server';

import { prisma } from '@/lib/prisma';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { r2Client } from '@/lib/r2-storage';
import { promises as fs } from 'fs';
import path from 'path';

export async function deleteFuelLog(formData: FormData) {
  const idRaw = formData.get('fuelLogId');
  const id = typeof idRaw === 'string' ? parseInt(idRaw) : Number(idRaw);
  if (!id || isNaN(id)) {
    throw new Error('Invalid fuelLogId');
  }

  const fuelLog = await prisma.fuelLog.findUnique({ where: { id } });
  if (!fuelLog) {
    return;
  }

  // Delete image from R2 if configured and imageUrl exists
  if (fuelLog.imageUrl && r2Client && process.env.R2_BUCKET) {
    try {
      // Extract key from URL (e.g., "/api/uploads/fuel-image?key=fuel/..." -> "fuel/...")
      const urlMatch = fuelLog.imageUrl.match(/key=([^&]+)/);
      const key = urlMatch ? decodeURIComponent(urlMatch[1]) : null;
      
      if (key) {
        await r2Client.send(new DeleteObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: key,
        }));
        console.log(`[R2] Deleted ${key}`);
      }
    } catch (error) {
      console.warn('[R2] Failed to delete image:', error instanceof Error ? error.message : error);
    }
  }

  // Delete image from local storage (Railway volume or public)
  if (fuelLog.imageUrl) {
    try {
      const urlMatch = fuelLog.imageUrl.match(/key=([^&]+)/);
      const key = urlMatch ? decodeURIComponent(urlMatch[1]) : null;
      
      if (key) {
        const filename = key.split('/').pop();
        const subdir = key.startsWith('fuel/') ? 'fuel' : 'deposit';
        
        // Try volume path first
        const volumePath = process.env.RAILWAY_VOLUME_MOUNT_PATH
          ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, subdir, filename!)
          : null;
        
        if (volumePath) {
          try {
            await fs.unlink(volumePath);
            console.log(`[Storage] Deleted from volume: ${volumePath}`);
          } catch {
            // Not in volume, try public
          }
        }
        
        // Try public path
        const publicPath = path.join(process.cwd(), 'public', 'uploads', subdir, filename!);
        try {
          await fs.unlink(publicPath);
          console.log(`[Storage] Deleted from public: ${publicPath}`);
        } catch {
          // File not found or already deleted
        }
      }
    } catch (error) {
      console.warn('[Storage] Failed to delete local image:', error instanceof Error ? error.message : error);
    }
  }

  // Delete potential associated FUEL transaction (match by userId, tipo, monto, and date window)
  const windowMs = 24 * 60 * 60 * 1000; // +/- 1 day
  await prisma.transaction.deleteMany({
    where: {
      userId: fuelLog.userId,
      tipo: 'FUEL',
      monto: fuelLog.monto,
      createdAt: {
        gte: new Date(fuelLog.fecha.getTime() - windowMs),
        lte: new Date(fuelLog.fecha.getTime() + windowMs),
      },
    },
  });

  await prisma.fuelLog.delete({ where: { id } });
}
// Railway rebuild Wed Dec 10 16:59:50 -03 2025
