import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/** Shrink a photo to max 1280 px JPEG in the browser (canvas). */
export async function prepareImage(uri: string) {
  const ref = await ImageManipulator.manipulate(uri).resize({ width: 1280 }).renderAsync();
  const out = await ref.saveAsync({ compress: 0.72, format: SaveFormat.JPEG });
  return out.uri;
}

export async function readBytes(uri: string): Promise<ArrayBuffer> {
  return (await fetch(uri)).arrayBuffer();
}

/** Small JPEG as a data: URL (demo mode keeps photos in local storage). */
export async function toDataUrl(uri: string) {
  const ref = await ImageManipulator.manipulate(uri).resize({ width: 720 }).renderAsync();
  const out = await ref.saveAsync({ compress: 0.6, format: SaveFormat.JPEG, base64: true });
  return `data:image/jpeg;base64,${out.base64}`;
}
