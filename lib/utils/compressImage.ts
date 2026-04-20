const MAX_DIMENSION = 1280;
const MAX_BYTES     = 500 * 1024; // 500 KB

async function drawCompressed(file: File, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
        width  = Math.round(width  * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width  = width;
      canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error('Canvas toBlob failed')),
        'image/jpeg',
        quality,
      );
    };

    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
    img.src = url;
  });
}

export async function compressImage(file: File): Promise<{ file: File; warning?: string }> {
  const MAX_INPUT = 5 * 1024 * 1024; // 5 MB pre-compression limit

  if (!file.type.startsWith('image/')) {
    throw new Error('NOT_IMAGE');
  }
  if (file.size > MAX_INPUT) {
    throw new Error('TOO_LARGE');
  }

  try {
    let blob = await drawCompressed(file, 0.7);

    if (blob.size > MAX_BYTES) {
      blob = await drawCompressed(file, 0.6);
    }

    const compressed = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
    return { file: compressed };
  } catch {
    // Fallback: use original file
    return { file, warning: 'Image not optimized' };
  }
}
