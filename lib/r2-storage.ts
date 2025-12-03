import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const hasR2Config = !!(
  process.env.R2_ENDPOINT &&
  process.env.R2_BUCKET &&
  process.env.R2_ACCESS_KEY_ID &&
  process.env.R2_SECRET_ACCESS_KEY
);

export const r2Client = hasR2Config
  ? new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID as string,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY as string,
      },
    })
  : null;

export async function uploadToR2(params: {
  key: string;
  contentType: string;
  body: Buffer;
}): Promise<string | null> {
  if (!r2Client || !process.env.R2_BUCKET) {
    return null;
  }

  try {
    await r2Client.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: params.key,
        Body: params.body,
        ContentType: params.contentType,
      })
    );

    // Return R2 public URL if configured, otherwise construct from endpoint
    const publicBase = process.env.R2_PUBLIC_URL_BASE;
    if (publicBase) {
      return `${publicBase}/${params.key}`;
    }

    // Default: construct URL from endpoint and bucket
    const endpoint = process.env.R2_ENDPOINT!;
    const bucket = process.env.R2_BUCKET!;
    return `${endpoint}/${bucket}/${params.key}`;
  } catch (error) {
    console.error('R2 upload failed:', error);
    return null;
  }
}
