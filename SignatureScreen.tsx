// src/screens/driver/SignatureScreen.tsx
import React, { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  Vibration, ActivityIndicator, Image
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { useStore } from '../../store';
import { Services } from '../../services/firebase';
import { serverTimestamp } from 'firebase/firestore';
import { LocalNotif } from '../../services/notificationService';
import { generateInvoicePDF } from '../../services/pdfService';

interface PathPoint { x: number; y: number; }

export function SignatureScreen({ route, navigation }: any) {
  const { deliveryId } = route.params;
  const { user, deliveries } = useStore();
  const delivery = deliveries.find(d => d.id === deliveryId);

  const [paths, setPaths]       = useState<string[]>([]);
  const [currentPath, setCurrentPath] = useState('');
  const [loading, setLoading]   = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const svgRef = useRef<any>(null);

  const panGesture = Gesture.Pan()
    .onStart(e => {
      setCurrentPath(`M ${e.x} ${e.y}`);
      setHasSignature(true);
    })
    .onUpdate(e => {
      setCurrentPath(p => `${p} L ${e.x} ${e.y}`);
    })
    .onEnd(() => {
      setPaths(p => [...p, currentPath]);
      setCurrentPath('');
    });

  const clearSig = () => {
    setPaths([]); setCurrentPath(''); setHasSignature(false);
  };

  const confirm = async () => {
    if (!hasSignature) {
      Alert.alert('Signature requise', 'Veuillez signer avant de confirmer.');
      return;
    }
    setLoading(true);
    try {
      // Convert SVG paths to base64 string (simplified — in production use react-native-view-shot)
      const sigData = `signature:${Date.now()}`;

      await Services.deliveries.updateStatus(deliveryId, 'delivered', {
        deliveredAt: serverTimestamp() as any,
        signature:   sigData,
      });

      // Decrement stock
      if (delivery?.items) {
        await Services.stock.decrementAfterDelivery(delivery.items);
      }

      await LocalNotif.deliveryDelivered(delivery?.reference || deliveryId);
      Vibration.vibrate([80, 40, 80, 40, 80]);

      // Ask if wants PDF
      Alert.alert(
        '✅ Livraison confirmée !',
        'Voulez-vous exporter le bon de livraison en PDF ?',
        [
          { text: 'Non', onPress: () => navigation.goBack() },
          {
            text: 'Oui, exporter PDF',
            onPress: async () => {
              try {
                // In production, fetch client data from Firestore
                await generateInvoicePDF(delivery as any, { companyName: delivery?.clientName } as any);
              } catch {}
              navigation.goBack();
            }
          }
        ]
      );
    } catch (e: any) {
      Alert.alert('Erreur', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>✍️ Signature de livraison</Text>
          <Text style={styles.headerSub}>{delivery?.clientName} · {delivery?.reference}</Text>
        </View>
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          Le destinataire confirme la réception de {delivery?.items?.length} article{(delivery?.items?.length || 0) > 1 ? 's' : ''} à {delivery?.address}
        </Text>
      </View>

      {/* SIGNATURE CANVAS */}
      <View style={styles.canvasWrap}>
        <Text style={styles.canvasLabel}>Signature du destinataire</Text>
        <GestureDetector gesture={panGesture}>
          <View style={styles.canvas} ref={svgRef}>
            <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
              {paths.map((d, i) => (
                <Path key={i} d={d} stroke="#0f172a" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
              ))}
              {currentPath ? (
                <Path d={currentPath} stroke="#0f172a" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
              ) : null}
            </Svg>
            {!hasSignature && (
              <Text style={styles.canvasPlaceholder}>Signez ici avec le doigt ✍️</Text>
            )}
          </View>
        </GestureDetector>
        <TouchableOpacity style={styles.clearBtn} onPress={clearSig}>
          <Text style={styles.clearBtnText}>Effacer</Text>
        </TouchableOpacity>
      </View>

      {/* DELIVERY SUMMARY */}
      <View style={styles.summaryBox}>
        <Text style={styles.summaryTitle}>Récapitulatif</Text>
        {delivery?.items?.slice(0, 3).map((item, i) => (
          <View key={i} style={styles.summaryRow}>
            <Text style={styles.summaryItem}>{item.name}</Text>
            <Text style={styles.summaryQty}>{item.qty} {item.unit}</Text>
          </View>
        ))}
        {(delivery?.items?.length || 0) > 3 && (
          <Text style={styles.summaryMore}>+{(delivery?.items?.length || 0) - 3} autres articles</Text>
        )}
      </View>

      {/* ACTIONS */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.cancelBtn} onPress={() => navigation.goBack()} disabled={loading}>
          <Text style={styles.cancelBtnText}>Annuler</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.confirmBtn, !hasSignature && styles.confirmBtnDisabled]} onPress={confirm} disabled={loading || !hasSignature} activeOpacity={0.85}>
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.confirmBtnText}>✅ Confirmer la livraison</Text>
          }
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:      { flex:1, backgroundColor:'#080c14' },
  header:         { padding:20, paddingBottom:12 },
  headerTitle:    { fontSize:20, fontWeight:'800', color:'#f0f4ff', letterSpacing:-.4 },
  headerSub:      { fontSize:13, color:'#8899bb', marginTop:3, fontFamily:'Courier' },

  infoBox:        { marginHorizontal:16, marginBottom:12, backgroundColor:'rgba(59,130,246,.1)', borderRadius:10, padding:12, borderWidth:1, borderColor:'rgba(59,130,246,.2)' },
  infoText:       { fontSize:13, color:'#93c5fd', lineHeight:18 },

  canvasWrap:     { marginHorizontal:16, marginBottom:12 },
  canvasLabel:    { fontSize:11, color:'#8899bb', fontFamily:'Courier', letterSpacing:.5, textTransform:'uppercase', marginBottom:8 },
  canvas:         { height:200, backgroundColor:'#ffffff', borderRadius:12, borderWidth:2, borderColor:'#1e2d47', overflow:'hidden', position:'relative', alignItems:'center', justifyContent:'center' },
  canvasPlaceholder:{ fontSize:15, color:'#94a3b8', opacity:.5 },
  clearBtn:       { alignSelf:'flex-start', marginTop:8, paddingVertical:7, paddingHorizontal:14, backgroundColor:'#1a2235', borderRadius:8, borderWidth:1, borderColor:'#2a3d5c' },
  clearBtnText:   { fontSize:12, color:'#8899bb', fontWeight:'600' },

  summaryBox:     { marginHorizontal:16, backgroundColor:'#111827', borderRadius:12, borderWidth:1, borderColor:'#1e2d47', padding:14, marginBottom:12 },
  summaryTitle:   { fontSize:11, color:'#8899bb', fontFamily:'Courier', letterSpacing:.5, textTransform:'uppercase', marginBottom:10 },
  summaryRow:     { flexDirection:'row', justifyContent:'space-between', paddingVertical:6, borderBottomWidth:1, borderBottomColor:'#1e2d47' },
  summaryItem:    { fontSize:13, color:'#f0f4ff' },
  summaryQty:     { fontSize:12, color:'#8899bb', fontFamily:'Courier' },
  summaryMore:    { fontSize:12, color:'#3d5070', fontFamily:'Courier', marginTop:6 },

  footer:         { flexDirection:'row', gap:10, padding:16, paddingBottom:32, marginTop:'auto' },
  cancelBtn:      { flex:1, paddingVertical:14, borderRadius:12, backgroundColor:'#1a2235', borderWidth:1, borderColor:'#2a3d5c', alignItems:'center' },
  cancelBtnText:  { fontSize:15, fontWeight:'600', color:'#8899bb' },
  confirmBtn:     { flex:2, paddingVertical:14, borderRadius:12, backgroundColor:'#10b981', alignItems:'center', justifyContent:'center', shadowColor:'#10b981', shadowOffset:{width:0,height:4}, shadowOpacity:.35, shadowRadius:10 },
  confirmBtnDisabled:{ opacity:.4 },
  confirmBtnText: { fontSize:15, fontWeight:'700', color:'#fff' },
});
