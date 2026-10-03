import { S3Client } from "@aws-sdk/client-s3";

export const BUCKET_NAME = process.env.RAILWAY_BUCKET_NAME || "videos";


let _s3Client: S3Client | null = null;

export function getS3Client(): S3Client {
  if (_s3Client) {
    return _s3Client;
  }

  const accessKeyId = process.env.RAILWAY_ACCESS_KEY_ID;
  const secretAccessKey = process.env.RAILWAY_SECRET_ACCESS_KEY;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error("Missing Railway S3 credentials");
  }

  _s3Client = new S3Client({
    region: process.env.RAILWAY_REGION || "us-east-1",
    endpoint: process.env.RAILWAY_ENDPOINT,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    forcePathStyle: true,
  });
  return _s3Client;
}
