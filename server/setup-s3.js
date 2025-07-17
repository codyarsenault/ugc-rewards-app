// setup-s3.js - Run this when you're ready to use S3
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import dotenv from 'dotenv';

dotenv.config();

// This is the S3 upload function you'll use when ready
export async function uploadToS3(file, filename) {
  const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  const upload = new Upload({
    client: s3Client,
    params: {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: `ugc-submissions/${filename}`,
      Body: file.buffer,
      ContentType: file.mimetype,
      ACL: 'public-read', // Make files publicly accessible
    },
  });

  const result = await upload.done();
  return result.Location; // Returns the public URL
}

// To use in your index.js later:
// Replace the local storage code with:
/*
if (req.file) {
  if (process.env.AWS_ACCESS_KEY_ID !== 'skip_for_now') {
    // Use S3
    mediaUrl = await uploadToS3(req.file, req.file.filename);
  } else {
    // Use local storage
    mediaUrl = `/uploads/${req.file.filename}`;
  }
}
*/