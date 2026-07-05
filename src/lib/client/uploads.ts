import type { Database } from "@/types/database";

const MAX_UPLOAD_SIZE_BYTES = 25 * 1024 * 1024;
const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
]);

export const CLIENT_UPLOAD_BUCKET = "event-uploads";

export type ClientUploadFileInput = {
  name: string;
  size: number;
  type: string;
};

export type ValidatedClientUploadFile = {
  fileName: string;
  fileMimeType: string;
  fileSizeBytes: number;
};

type UploadInsert = Database["public"]["Tables"]["uploads"]["Insert"];

export function validateClientUploadFile(
  file: ClientUploadFileInput,
): ValidatedClientUploadFile {
  const fileName = file.name.trim();
  const fileMimeType = file.type.trim().toLowerCase();

  if (!fileName) {
    throw new Error("Unable to upload file: file name is required");
  }

  if (file.size <= 0) {
    throw new Error("Unable to upload file: file is empty");
  }

  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    throw new Error("Unable to upload file: file must be 25 MB or smaller");
  }

  if (!ALLOWED_UPLOAD_MIME_TYPES.has(fileMimeType)) {
    throw new Error("Unable to upload file: unsupported file type");
  }

  return {
    fileName,
    fileMimeType,
    fileSizeBytes: file.size,
  };
}

export function buildClientUploadStoragePath({
  eventId,
  fileName,
  uploadId,
}: {
  eventId: string;
  fileName: string;
  uploadId: string;
}): string {
  const cleanEventId = eventId.trim();
  const cleanUploadId = uploadId.trim();

  if (!cleanEventId) {
    throw new Error("Unable to upload file: missing event ID");
  }

  if (!cleanUploadId) {
    throw new Error("Unable to upload file: missing upload ID");
  }

  return `events/${cleanEventId}/client/${cleanUploadId}-${slugifyFileName(fileName)}`;
}

export function buildClientUploadInsert({
  eventId,
  fileName,
  fileMimeType,
  fileSizeBytes,
  storageBucket,
  storagePath,
}: {
  eventId: string;
  fileName: string;
  fileMimeType: string;
  fileSizeBytes: number;
  storageBucket: string;
  storagePath: string;
}): UploadInsert {
  const cleanEventId = eventId.trim();
  const cleanBucket = storageBucket.trim();
  const cleanPath = storagePath.trim();
  const validatedFile = validateClientUploadFile({
    name: fileName,
    size: fileSizeBytes,
    type: fileMimeType,
  });

  if (!cleanEventId) {
    throw new Error("Unable to upload file: missing event ID");
  }

  if (!cleanBucket) {
    throw new Error("Unable to upload file: missing storage bucket");
  }

  if (!cleanPath) {
    throw new Error("Unable to upload file: missing storage path");
  }

  return {
    event_id: cleanEventId,
    file_name: validatedFile.fileName,
    file_mime_type: validatedFile.fileMimeType,
    file_size_bytes: validatedFile.fileSizeBytes,
    storage_bucket: cleanBucket,
    storage_path: cleanPath,
    status: "needs_review",
    uploaded_by: "client",
    metadata: {
      source: "client_portal",
      status: "needs_review",
    },
  };
}

function slugifyFileName(fileName: string): string {
  const trimmed = fileName.trim().toLowerCase();
  const sanitized = trimmed
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return sanitized || "upload";
}
