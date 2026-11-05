import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';

/** Shrink a photo to max 1280 px JPEG: faster uploads, and the AI needs no more than that. */
export async function prepareImage(uri: string) {
  const ref = await ImageManipulator.manipulate(uri, { maxWidth: 1600, maxHeight: 1600 }).resize({ width: 1280 }).renderAsync();
  const out = await ref.saveAsync({ compress: 0.72, format: SaveFormat.JPEG });
  return out.uri;
}

export async function readBytes(uri: string): Promise<ArrayBuffer> {
  if (Platform.OS === 'web') return (await fetch(uri)).arrayBuffer();
  return new File(uri).arrayBuffer();
}

/** Small JPEG as a data: URL (demo mode keeps photos in local storage). */
export async function toDataUrl(uri: string) {
  const ref = await ImageManipulator.manipulate(uri).resize({ width: 720 }).renderAsync();
  const out = await ref.saveAsync({ compress: 0.6, format: SaveFormat.JPEG, base64: true });
  return `data:image/jpeg;base64,${out.base64}`;
}
