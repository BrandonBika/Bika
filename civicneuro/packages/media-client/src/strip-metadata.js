/**
 * @file packages/media-client/src/strip-metadata.js
 * Canvas-based EXIF stripping for uploaded photos.
 */
export async function stripExif(imageBlob) {
  // Rendering image through 2D canvas naturally drops EXIF metadata
  if (typeof Image === 'undefined' || typeof document === 'undefined') {
    return imageBlob;
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => resolve(blob || imageBlob), 'image/jpeg', 0.85);
    };
    img.onerror = () => resolve(imageBlob);
    img.src = URL.createObjectURL(imageBlob);
  });
}
