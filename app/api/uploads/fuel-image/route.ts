import { NextRequest, NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { promises as fs } from 'fs';
import path from 'path';

const hasR2Config = !!(
  process.env.R2_ENDPOINT &&
  process.env.R2_BUCKET &&
  process.env.R2_ACCESS_KEY_ID &&
  process.env.R2_SECRET_ACCESS_KEY
);

const r2Client = hasR2Config
  ? new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    })
  : null;

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

    // 1) Try local storage FIRST (Railway volume)
    const volumePath = process.env.RAILWAY_VOLUME_MOUNT_PATH
      ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, subdir, filename)
      : null;
    
    const publicPath = path.join(process.cwd(), 'public', 'uploads', subdir, filename);

    // Check volume path first
    if (volumePath) {
      try {
        const data = await fs.readFile(volumePath);
        console.log(`[Local] Served from volume: ${volumePath}`);
        return new NextResponse(new Uint8Array(data), {
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=31536000, immutable',
          },
        });
      } catch {
        // File not in volume, continue
      }
    }

    // Check public path
    try {
      const data = await fs.readFile(publicPath);
      console.log(`[Local] Served from public: ${publicPath}`);
      return new NextResponse(new Uint8Array(data), {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    } catch {
      // File not in public, continue to R2
    }

    // 2) Try R2 as fallback
    if (r2Client && process.env.R2_BUCKET) {
      try {
        const command = new GetObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: key,
        });

        const response = await r2Client.send(command);
        
        if (response.Body) {
          const chunks: Uint8Array[] = [];
          for await (const chunk of response.Body as any) {
            chunks.push(chunk);
          }
          const buffer = Buffer.concat(chunks);
          console.log(`[R2] Served from R2: ${key}`);

          return new NextResponse(buffer, {
            headers: {
              'Content-Type': contentType,
              'Cache-Control': 'public, max-age=31536000, immutable',
            },
          });
        }
      } catch (r2Error: any) {
        console.error('[R2] Fetch failed:', r2Error.message);
      }
    }

    // Not found anywhere
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
