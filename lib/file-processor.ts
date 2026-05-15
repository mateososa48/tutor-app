export const ACCEPTED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "text/plain",
];

export const ACCEPTED_EXTENSIONS = ".jpg,.jpeg,.png,.txt";
export const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB — Gemini inlineData limit

export interface UploadedFile {
  id: string;
  label: string;  // "File 1", "File 2" — stable, never reassigned
  name: string;   // original filename
  mimeType: string;
  base64: string; // raw base64, no data-URL prefix
}

export function validateFile(file: File): string | null {
  if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      return `"${file.name}" is a PDF. Live sessions do not support PDFs yet — upload a screenshot/photo or a .txt file.`;
    }
    return `"${file.name}" is not supported. Upload JPG, PNG, or text files.`;
  }
  if (file.size > MAX_FILE_BYTES) {
    return `"${file.name}" is too large (max 20 MB).`;
  }
  return null;
}

export async function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.split(",")[1]);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function fileTypeLabel(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "Image";
  return "Text";
}
