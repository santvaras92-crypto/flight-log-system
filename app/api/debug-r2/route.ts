import { NextResponse } from "next/server";
import { S3Client, ListObjectsV2Command, HeadBucketCommand } from '@aws-sdk/client-s3';

export const dynamic = 'force-dynamic';

export async function GET() {
  const endpoint = process.env.R2_ENDPOINT || '';
  
  const results: any = {
    timestamp: new Date().toISOString(),
    config: {
      endpoint: endpoint ? `${endpoint.slice(0, 30)}...` : 'missing',
      endpointFormat: endpoint.includes('.r2.cloudflarestorage.com') ? 'correct' : 'possibly incorrect',
      bucket: process.env.R2_BUCKET || 'missing',
      accessKeyId: process.env.R2_ACCESS_KEY_ID ? `${process.env.R2_ACCESS_KEY_ID.slice(0,8)}...` : 'missing',
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ? 'set (hidden)' : 'missing',
    },
    expectedEndpointFormat: 'https://<ACCOUNT_ID>.r2.cloudflarestorage.com',
    connection: null,
    objects: null,
    error: null,
  };

  if (!process.env.R2_ENDPOINT || !process.env.R2_BUCKET || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
    results.error = 'Missing R2 configuration';
    return NextResponse.json(results);
  }

  try {
    const client = new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });

    // Test connection
    try {
      await client.send(new HeadBucketCommand({ Bucket: process.env.R2_BUCKET }));
      results.connection = 'success';
    } catch (headError: any) {
      results.connection = `failed: ${headError.message}`;
    }

    // List objects
    try {
      const listResponse = await client.send(new ListObjectsV2Command({
        Bucket: process.env.R2_BUCKET,
        MaxKeys: 20,
      }));

      results.objects = {
        count: listResponse.KeyCount || 0,
        isTruncated: listResponse.IsTruncated || false,
        files: (listResponse.Contents || []).map(obj => ({
          key: obj.Key,
          size: obj.Size,
          lastModified: obj.LastModified?.toISOString(),
        })),
      };
    } catch (listError: any) {
      results.objects = { error: listError.message };
    }

  } catch (error: any) {
    results.error = error.message;
  }

  return NextResponse.json(results);
}
