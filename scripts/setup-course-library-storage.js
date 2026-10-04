import dotenv from 'dotenv';
import { S3Client, PutBucketCorsCommand } from '@aws-sdk/client-s3';
import { resolve } from 'node:path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_ENDPOINT_URL_S3, AWS_REGION } = process.env;
if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !AWS_ENDPOINT_URL_S3 || !AWS_REGION) {
  throw new Error('Neon Object Storage credentials are missing; run `neon env pull` first.');
}

const client = new S3Client({
  endpoint: AWS_ENDPOINT_URL_S3,
  region: AWS_REGION,
  credentials: { accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY },
  forcePathStyle: true
});

try {
  await client.send(new PutBucketCorsCommand({
    Bucket: 'stc-course-library',
    CORSConfiguration: {
      CORSRules: [{
        AllowedOrigins: ['*'],
        AllowedMethods: ['POST', 'GET', 'HEAD'],
        AllowedHeaders: ['*'],
        ExposeHeaders: ['ETag'],
        MaxAgeSeconds: 3600
      }]
    }
  }));
  console.log('Configured browser access for private, signed course-library uploads.');
} finally {
  client.destroy();
}
