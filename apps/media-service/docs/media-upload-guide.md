# Media Upload via API — Step-by-Step Guide

Uploading media (photos, documents) to `media-service` is a 3-step flow: request a
presigned S3 URL, upload the file directly to S3, then finalize the record with the
backend.

---

## Step 1: Request a presigned upload URL

```
POST /api/v1/media/upload-url
```

**Headers required:**

- `Content-Type: application/json`
- Auth headers set by the gateway after verifying your token: `x-armman-user-id`,
  `x-armman-roles` (must include `SAKHI` or `SUPERVISOR`)

**Request body:**

```json
{
  "assetType": "CONSENT_PHOTO",
  "mimeType": "image/jpeg",
  "sizeBytes": 204800
}
```

- `assetType` — one of: `CONSENT_PHOTO`, `REFERRAL_CASE_PAPER`, `REFERRAL_DISCHARGE_SUMMARY`,
  `REFERRAL_HEALTH_FACILITY_PHOTO`, `REFERRAL_SAKHI_BENEFICIARY_PHOTO`,
  `REFERRAL_INVESTIGATION_REPORT`, `TRAINING_PHOTO`, `HEALTH_EDUCATION`, `FAQ`,
  `REPORT_EXPORT`, `OTHER`
- `mimeType` — must be in the allowed list (`image/jpeg`, `image/png`, `image/webp`,
  `application/pdf` by default, env-configurable)
- `sizeBytes` — the file's actual size; capped by `MAX_UPLOAD_SIZE_BYTES` (25 MB default)

**Response — `200 OK`:**

```json
{
  "success": true,
  "message": "OK",
  "data": {
    "uploadUrl": "https://<bucket>.s3.ap-south-1.amazonaws.com/media/consent_photo/<uuid>?X-Amz-...",
    "s3Key": "media/consent_photo/<uuid>",
    "expiresInSeconds": 900,
    "maxSizeBytes": 26214400
  }
}
```

Save both `uploadUrl` and `s3Key` — both are needed for the next steps.

---

## Step 2: Upload the file directly to S3

```
PUT <uploadUrl>
```

- Body: the raw file bytes
- Header: `Content-Type` matching the `mimeType` declared in Step 1
- No AWS SDK needed — a plain HTTP PUT works. No special checksum header required.
- The URL expires after `expiresInSeconds` (15 minutes default) — if it expires, repeat
  Step 1 for a fresh one.

A successful upload returns `200` directly from S3.

---

## Step 3: Finalize the upload

```
POST /api/v1/media
```

**Request body:**

```json
{
  "assetType": "CONSENT_PHOTO",
  "s3Key": "media/consent_photo/<uuid>",
  "expectedSizeBytes": 204800,
  "uploadedAt": "2026-08-13T00:00:00Z",
  "beneficiaryId": "optional-uuid-if-linked",
  "visitId": "optional-uuid-if-linked"
}
```

- `s3Key` — exactly what Step 1 returned
- `expectedSizeBytes` — the same size declared in Step 1 (used to verify the upload
  wasn't truncated/wrong)
- Optional linkage fields: `beneficiaryId`, `visitId`, `submissionId`, `referralId`,
  `followupId`, `eventId`, `linkedEntityType`/`linkedEntityId` — attach the media to
  whatever record it belongs to

**Response — `201 Created`:**

```json
{
  "success": true,
  "message": "OK",
  "data": {
    "id": "generated-uuid",
    "assetType": "CONSENT_PHOTO",
    "storageUri": "s3://<bucket>/media/consent_photo/<uuid>",
    "mimeType": "image/jpeg",
    "sizeBytes": "204800",
    "uploadedByUserId": null,
    "uploadedAt": "2026-08-13T00:00:00.000Z",
    "linkedEntityType": null,
    "linkedEntityId": null,
    "encryptedFlag": true,
    "beneficiaryId": null,
    "visitId": null,
    "submissionId": null,
    "referralId": null,
    "followupId": null,
    "eventId": null,
    "createdAt": "2026-08-13T00:00:00.000Z",
    "updatedAt": "2026-08-13T00:00:00.000Z"
  }
}
```

This `id` is the `mediaAssetId`/`photoMediaId` to store on whatever record needs it
(e.g. `SupervisorEvent.photoMediaId`).

---

## Error reference

| Status | Endpoint                 | Meaning                                                                                   |
| ------ | ------------------------ | ----------------------------------------------------------------------------------------- |
| `400`  | `POST /media/upload-url` | Disallowed `mimeType` or `sizeBytes` too large                                            |
| `400`  | `POST /media`            | Object not found at that `s3Key` — Step 2 was skipped or didn't complete                  |
| `422`  | `POST /media`            | Uploaded file's actual size doesn't match `expectedSizeBytes` — truncated or wrong upload |
| `401`  | either                   | Missing/invalid `x-armman-user-id`                                                        |
| `403`  | either                   | Caller role not `SAKHI`/`SUPERVISOR`                                                      |
