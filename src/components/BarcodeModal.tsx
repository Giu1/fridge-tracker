import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useEffect, useRef } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

/** Full-screen barcode scanner (EAN/UPC on food packages). */
export function BarcodeModal({ visible, onClose, onCode }: { visible: boolean; onClose: () => void; onCode: (code: string) => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const handled = useRef(false);

  useEffect(() => {
    if (visible) {
      handled.current = false;
      if (!permission?.granted) requestPermission();
    }
  }, [visible, permission?.granted, requestPermission]);

  const onBarcode = (r: BarcodeScanningResult) => {
    if (handled.current) return;
    handled.current = true;
    onCode(r.data);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {permission?.granted ? (
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
            onBarcodeScanned={onBarcode}
          />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff' }}>Camera permission needed to scan barcodes.</Text>
          </View>
        )}
        <View style={styles.scanOverlay} pointerEvents="none">
          <View style={styles.scanFrame} />
          <Text style={{ color: '#fff', marginTop: 16, fontWeight: '600' }}>Point at the barcode on the package</Text>
        </View>
        <Pressable onPress={onClose} style={styles.scanClose}>
          <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scanOverlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  scanFrame: { width: 260, height: 160, borderWidth: 3, borderColor: '#fff', borderRadius: 16 },
  scanClose: { position: 'absolute', bottom: 50, alignSelf: 'center', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.2)' },
});
