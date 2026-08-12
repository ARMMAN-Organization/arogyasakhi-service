# media-service

Signed-URL media uploads and metadata tracking. See root [`.claude/CLAUDE.md`](../../.claude/CLAUDE.md) for standards.

## Run

```bash
cp .env.example .env
npx prisma generate --schema prisma/schema.prisma
npx nx serve media-service   # http://localhost:3011/api/v1
```

Health: `/api/v1/health/live`, `/api/v1/health/ready`.

## Upload flow

Media is uploaded directly to S3, not proxied through this service:

1. `POST /media/upload-url` — request a presigned S3 `PutObject` URL for an `assetType` +
   `mimeType` + `sizeBytes`. Returns `{ uploadUrl, s3Key, expiresInSeconds, maxSizeBytes }`.
2. The client `PUT`s the file directly to `uploadUrl`, with an `x-amz-checksum-sha256` header
   carrying the file's SHA-256 checksum (base64-encoded, per the S3 API). Clients using an
   S3-aware SDK/checksum-capable HTTP client typically get this computed automatically from the
   presigned URL's signed parameters; otherwise compute the SHA-256 client-side and set the
   header explicitly. The upload fails without it — the presigned URL is signed to require it.
3. `POST /media` — finalize the record with `{ assetType, s3Key, ... }`. The service calls S3's
   `HeadObject` to verify the upload landed and reads back the real size, content type, and
   checksum (never trusting client-supplied values for these). Returns `400` if the object isn't
   found yet, `422` if it's missing the checksum.

AWS credentials are never configured in this service's env — the AWS SDK's default credential
provider chain is used (IAM task role in deployed environments, a local AWS profile in dev).
