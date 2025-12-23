import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { r2Client } from '@/lib/r2-storage';

async function streamToBuffer(stream: any) {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key'); // e.g., "fuel/123456-uuid.jpg"
    
    if (!key) {
      return NextResponse.json({ error: 'Missing key parameter' }, { status: 400 });
    }

    const filename = key.split('/').pop();
    if (!filename) {
      return NextResponse.json({ error: 'Invalid key format' }, { status: 400 });
    }

    const subdir = key.startsWith('fuel/') ? 'fuel' : 'deposit';
    
    // Determine content type from key extension
    const ext = key.split('.').pop()?.toLowerCase();
    const contentType = 
      ext === 'png' ? 'image/png' :
      ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
      ext === 'webp' ? 'image/webp' :
      ext === 'pdf' ? 'application/pdf' :
      'application/octet-stream';

    // Try R2 first if configured
    if (r2Client && process.env.R2_BUCKET) {
      try {
        const object = await r2Client.send(new GetObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: key,
        }));

        if (object.Body) {
          const data = await streamToBuffer(object.Body);
          console.log(`[Storage] Served from R2: ${key}`);

          return new NextResponse(new Uint8Array(data), {
            headers: {
              'Content-Type': contentType,
              'Cache-Control': 'public, max-age=31536000, immutable',
            },
          });
        }
      } catch (err) {
        console.warn(`[R2] Fallback to local for ${key}:`, err instanceof Error ? err.message : err);
      }
    }

    // Try Railway volume next (production)
    const volumePath = process.env.RAILWAY_VOLUME_MOUNT_PATH
      ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, subdir, filename)
      : null;
    
    // Then try public folder (local dev)
    const publicPath = path.join(process.cwd(), 'public', 'uploads', subdir, filename);

    let data: Buffer | null = null;

    // Check volume path first
    if (volumePath) {
      try {
        data = await fs.readFile(volumePath);
        console.log(`[Storage] Served from volume: ${volumePath}`);
      } catch {
        // Not in volume, try public
      }
    }

    // Check public path if not found in volume
    if (!data) {
      try {
        data = await fs.readFile(publicPath);
        console.log(`[Storage] Served from public: ${publicPath}`);
      } catch {
        // Not found anywhere
      }
    }

    if (data) {
      return new NextResponse(new Uint8Array(data), {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    }

    // Not found
    console.error(`[404] Image not found: ${key}`);
    return NextResponse.json(
      { error: 'Image not found', key },
      { status: 404 }
    );
  } catch (error: any) {
    console.error('Error serving image:', error);
    return NextResponse.json(
      { error: 'Image not found' },
      { status: 404 }
    );
  }
}
