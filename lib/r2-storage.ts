// rebuild trigger 1765397735
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
}): Promise<boolean> {
  if (!r2Client || !process.env.R2_BUCKET) {
    return false;
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

    return true;
  } catch (error) {
    console.error('R2 upload failed:', error);
    return false;
  }
}
