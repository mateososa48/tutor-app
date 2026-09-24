"use client";

import { fitWithin, PHOTO_MAX_BYTES, PHOTO_MAX_EDGE } from "./phone-link";

// The phone's half of a photo: whatever the camera or the photo library hands
// over (a 12-megapixel JPEG, an iPhone HEIC, a screenshot) is drawn onto a
// canvas at a 1600px long edge and saved as a JPEG under the size limit. That
// one step keeps every upload under Vercel's 4.5 MB request cap, turns HEIC
// into something every tutor can read, and drops the file's metadata,
// including where it was taken, because a canvas only carries pixels.
//
// Rotation: browsers apply a photo's EXIF orientation when they decode it into
// an <img> (`image-orientation: from-image` is the default everywhere we run),
// so the size it reports and the pixels it draws are already upright.

export type ShrunkPhoto = { data: string; width: number; height: number; blob: Blob };

export class PhotoReadError extends Error {}

function load(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  return img
    .decode()
    .then(() => img)
    .catch(() => {
      throw new PhotoReadError("Couldn't read that photo. Try taking it with the camera instead.");
    })
    .finally(() => URL.revokeObjectURL(url));
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Qualities to try, best first; a busy page at 1600px lands under the limit at the first one almost always. */
const QUALITIES = [0.86, 0.78, 0.68, 0.58];

export async function shrinkPhoto(file: File): Promise<ShrunkPhoto> {
  const img = await load(file);
  const { width, height } = fitWithin(img.naturalWidth, img.naturalHeight, PHOTO_MAX_EDGE);
  if (!width || !height) throw new PhotoReadError("Couldn't read that photo. Try taking it with the camera instead.");

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new PhotoReadError("This phone couldn't prepare the photo. Try another browser.");
  // White under a transparent PNG, since a JPEG has no transparency and would turn it black.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, width, height);

  try {
    for (const q of QUALITIES) {
      const blob = await toBlob(canvas, q);
      if (blob && blob.size <= PHOTO_MAX_BYTES) return { blob, width, height, data: await toBase64(blob) };
    }
  } finally {
    // Let the phone have the memory back straight away; big canvases are what iOS kills tabs for.
    canvas.width = 0;
    canvas.height = 0;
  }
  throw new PhotoReadError("That photo is too detailed to send. Try one a little further away.");
}
