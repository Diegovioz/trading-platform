const MAX_DIMENSION  = 1280;
const MAX_INPUT_BYTES = 10 * 1024 * 1024; // 10 MB — reject before compression
const TARGET_BYTES    =  1 * 1024 * 1024; // 1 MB — soft target after compression

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
  if (!file.type.startsWith('image/')) throw new Error('NOT_IMAGE');
  if (file.size > MAX_INPUT_BYTES)     throw new Error('TOO_LARGE');

  console.log(`[compressImage] original: ${(file.size / 1024).toFixed(1)} KB`);

  try {
    // Always compress at 0.7 first
    let blob = await drawCompressed(file, 0.7);
    console.log(`[compressImage] after 0.7: ${(blob.size / 1024).toFixed(1)} KB`);

    // If still above target, try 0.55
    if (blob.size > TARGET_BYTES) {
      blob = await drawCompressed(file, 0.55);
      console.log(`[compressImage] after 0.55: ${(blob.size / 1024).toFixed(1)} KB`);
    }

    // Always upload regardless — never block
    const compressed = new File(
      [blob],
      file.name.replace(/\.[^.]+$/, '.jpg'),
      { type: 'image/jpeg' },
    );

    console.log(`[compressImage] final: ${(compressed.size / 1024).toFixed(1)} KB`);
    return { file: compressed };
  } catch (err) {
    console.warn('[compressImage] compression failed, using original:', err);
    return { file, warning: 'Image not optimized' };
  }
}
