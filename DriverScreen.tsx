// src/screens/driver/DriverScreen.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Animated, PanResponder, Linking, Alert, Vibration,
  Dimensions, ActivityIndicator
} from 'react-native';
import { useStore } from '../../store';
import { Services } from '../../services/firebase';
import { LocalNotif } from '../../services/notificationService';
import { serverTimestamp } from 'firebase/firestore';

const { width } = Dimensions.get('window');
const SWIPE_THRESHOLD = 80;

export function DriverScreen({ navigation }: any) {
  const { user, deliveries } = useStore();
  const [loading, setLoading] = useState<string | null>(null);

  const myDeliveries = deliveries.filter(d =>
    d.driverId === user?.uid &&
    ['assigned', 'in_transit', 'pending'].includes(d.status)
  ).sort((a, b) => a.scheduledAt?.seconds - b.scheduledAt?.seconds);

  const takeCharge = useCallback(async (deliveryId: string) => {
    setLoading(deliveryId);
    try {
      await Services.deliveries.updateStatus(deliveryId, 'in_transit', {
        startedAt: serverTimestamp() as any,
        driverName: user?.displayName,
      });
      Vibration.vibrate(50);
    } catch (e: any) {
      Alert.alert('Erreur', e.message);
    } finally { setLoading(null); }
  }, [user]);

  const reportIncident = useCallback((deliveryId: string) => {
    Alert.prompt(
      '⚠️ Signaler un incident',
      'Décrivez le problème rencontré :',
      async (text) => {
        if (!text?.trim()) return;
        try {
          await Services.deliveries.updateStatus(deliveryId, 'incident', {
            incidentNote: text,
          });
          await Services.incidents.create({
            deliveryId,
            driverId:   user!.uid,
            driverName: user!.displayName,
            type:       'other',
            description: text,
            photos:     [],
            status:     'open',
          });
          await LocalNotif.incident(deliveryId);
          Vibration.vibrate([100, 50, 100]);
        } catch (e: any) { Alert.alert('Erreur', e.message); }
      },
      'plain-text'
    );
  }, [user]);

  if (myDeliveries.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyIcon}>🚛</Text>
        <Text style={styles.emptyTitle}>Aucune livraison assignée</Text>
        <Text style={styles.emptySub}>Vos livraisons du jour apparaîtront ici</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.statusBar}>
        <View style={styles.statusDot} />
        <Text style={styles.statusText}>En service · {myDeliveries.length} livraison{myDeliveries.length > 1 ? 's' : ''}</Text>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 14 }}>
        {myDeliveries.map((d, i) => (
          <SwipeableDeliveryCard
            key={d.id}
            delivery={d}
            index={i}
            loading={loading === d.id}
            onTakeCharge={() => takeCharge(d.id)}
            onDeliver={() => navigation.navigate('Signature', { deliveryId: d.id })}
            onIncident={() => reportIncident(d.id)}
            onOpenWaze={() => {
              const url = d.lat
                ? `https://waze.com/ul?ll=${d.lat},${d.lon}&navigate=yes`
                : `https://waze.com/ul?q=${encodeURIComponent(d.address)}&navigate=yes`;
              Linking.openURL(url);
            }}
          />
        ))}
      </ScrollView>
    </View>
  );
}

// ── SWIPEABLE CARD ────────────────────────────────────────
function SwipeableDeliveryCard({ delivery: d, index, loading, onTakeCharge, onDeliver, onIncident, onOpenWaze }: any) {
  const translateX = useRef(new Animated.Value(0)).current;
  const bgOpacity  = useRef(new Animated.Value(0)).current;
  const bgColor    = useRef('green');

  const panResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8,
    onPanResponderMove: (_, g) => {
      translateX.setValue(g.dx);
      bgColor.current = g.dx > 0 ? 'green' : 'red';
      bgOpacity.setValue(Math.min(Math.abs(g.dx) / SWIPE_THRESHOLD, 1));
    },
    onPanResponderRelease: (_, g) => {
      if (g.dx > SWIPE_THRESHOLD) {
        Animated.timing(translateX, { toValue: width, duration: 200, useNativeDriver: true }).start(() => {
          translateX.setValue(0); bgOpacity.setValue(0);
          onDeliver();
        });
      } else if (g.dx < -SWIPE_THRESHOLD) {
        Animated.timing(translateX, { toValue: -width, duration: 200, useNativeDriver: true }).start(() => {
          translateX.setValue(0); bgOpacity.setValue(0);
          onIncident();
        });
      } else {
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
        Animated.timing(bgOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start();
      }
    },
  })).current;

  const priorityColor = d.priority === 'urgent' ? '#ef4444' : d.priority === 'low' ? '#94a3b8' : '#3b82f6';
  const statusColor   = { assigned:'#f59e0b', in_transit:'#3b82f6', pending:'#f59e0b' }[d.status as string] || '#8899bb';

  return (
    <View style={styles.swipeWrap}>
      {/* SWIPE BACKGROUNDS */}
      <Animated.View style={[styles.swipeBg, styles.swipeBgLeft, { opacity: bgOpacity }]}>
        <Text style={styles.swipeHint}>✅ Livré</Text>
      </Animated.View>
      <Animated.View style={[styles.swipeBg, styles.swipeBgRight, { opacity: bgOpacity }]}>
        <Text style={styles.swipeHint}>⚠️ Incident</Text>
      </Animated.View>

      {/* CARD */}
      <Animated.View style={[styles.card, { transform: [{ translateX }] }]} {...(d.status !== 'assigned' ? panResponder.panHandlers : {})}>

        {/* HEADER */}
        <View style={styles.cardHeader}>
          <View style={[styles.indexBadge, { backgroundColor: priorityColor }]}>
            <Text style={styles.indexText}>{index + 1}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.clientName} numberOfLines={1}>{d.clientName}</Text>
            <Text style={styles.addr} numberOfLines={1}>📍 {d.address}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '20', borderColor: statusColor + '40' }]}>
            <View style={[styles.statusDotSmall, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusBadgeText, { color: statusColor }]}>
              {{ assigned:'Assigné', in_transit:'Transit', pending:'Attente' }[d.status as string]}
            </Text>
          </View>
        </View>

        {/* MATERIALS */}
        <View style={styles.matsWrap}>
          {d.items?.map((item: any, i: number) => (
            <View key={i} style={styles.matRow}>
              <Text style={styles.matName}>{item.name}</Text>
              <View style={styles.matQtyBadge}>
                <Text style={styles.matQtyText}>{item.qty} {item.unit}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* NOTES */}
        {d.notes ? (
          <View style={styles.notesBox}>
            <Text style={styles.notesText}>📝 {d.notes}</Text>
          </View>
        ) : null}

        {/* ACTIONS */}
        <View style={styles.cardActions}>
          <TouchableOpacity style={styles.actionBtn} onPress={onOpenWaze} activeOpacity={0.8}>
            <Text style={styles.actionBtnText}>🗺️ Waze</Text>
          </TouchableOpacity>

          {d.status === 'assigned' || d.status === 'pending' ? (
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnPrimary]}
              onPress={onTakeCharge}
              activeOpacity={0.8}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={[styles.actionBtnText, { color: '#fff' }]}>🚛 Prendre en charge</Text>
              }
            </TouchableOpacity>
          ) : null}

          {d.status === 'in_transit' ? (
            <>
              <TouchableOpacity style={[styles.actionBtn, styles.actionBtnGreen]} onPress={onDeliver} activeOpacity={0.8}>
                <Text style={[styles.actionBtnText, { color: '#fff' }]}>✅ Livrer</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, styles.actionBtnDanger]} onPress={onIncident} activeOpacity={0.8}>
                <Text style={[styles.actionBtnText, { color: '#ef4444' }]}>⚠️</Text>
              </TouchableOpacity>
            </>
          ) : null}
        </View>

        {/* SWIPE HINT (transit only) */}
        {d.status === 'in_transit' && (
          <Text style={styles.swipeTip}>← Glisser pour incident · Glisser pour livrer →</Text>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#080c14' },
  statusBar:       { flexDirection:'row', alignItems:'center', gap:8, padding:14, paddingBottom:6 },
  statusDot:       { width:8, height:8, borderRadius:4, backgroundColor:'#10b981' },
  statusText:      { fontSize:13, color:'#10b981', fontWeight:'600', fontFamily:'Courier' },

  emptyWrap:       { flex:1, backgroundColor:'#080c14', alignItems:'center', justifyContent:'center', padding:40 },
  emptyIcon:       { fontSize:56, opacity:.2, marginBottom:14 },
  emptyTitle:      { fontSize:20, fontWeight:'700', color:'#f0f4ff', marginBottom:6 },
  emptySub:        { fontSize:13, color:'#8899bb', textAlign:'center' },

  swipeWrap:       { position:'relative', marginBottom:12, borderRadius:14, overflow:'hidden' },
  swipeBg:         { position:'absolute', inset:0, alignItems:'center', justifyContent:'center', borderRadius:14 },
  swipeBgLeft:     { backgroundColor:'#10b981', left:0, right:'50%' },
  swipeBgRight:    { backgroundColor:'#ef4444', left:'50%', right:0 },
  swipeHint:       { color:'#fff', fontWeight:'800', fontSize:14 },

  card:            { backgroundColor:'#111827', borderWidth:1, borderColor:'#1e2d47', borderRadius:14, overflow:'hidden' },
  cardHeader:      { flexDirection:'row', alignItems:'flex-start', gap:10, padding:14, borderBottomWidth:1, borderBottomColor:'#1e2d47' },
  indexBadge:      { width:34, height:34, borderRadius:9, alignItems:'center', justifyContent:'center', flexShrink:0 },
  indexText:       { color:'#fff', fontWeight:'800', fontSize:14 },
  clientName:      { fontSize:17, fontWeight:'700', color:'#f0f4ff', letterSpacing:-.3 },
  addr:            { fontSize:12, color:'#8899bb', marginTop:2 },
  statusBadge:     { flexDirection:'row', alignItems:'center', gap:5, paddingHorizontal:10, paddingVertical:4, borderRadius:20, borderWidth:1 },
  statusDotSmall:  { width:5, height:5, borderRadius:3 },
  statusBadgeText: { fontSize:10, fontWeight:'700', fontFamily:'Courier' },

  matsWrap:        { padding:14, paddingTop:10 },
  matRow:          { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingVertical:8, borderBottomWidth:1, borderBottomColor:'#1e2d47' },
  matName:         { fontSize:14, color:'#f0f4ff', flex:1 },
  matQtyBadge:     { backgroundColor:'#1a2235', paddingHorizontal:10, paddingVertical:3, borderRadius:7 },
  matQtyText:      { fontSize:11, color:'#8899bb', fontFamily:'Courier' },

  notesBox:        { marginHorizontal:14, marginBottom:10, backgroundColor:'#1a2235', borderRadius:8, padding:10 },
  notesText:       { fontSize:12, color:'#8899bb' },

  cardActions:     { flexDirection:'row', gap:8, padding:12, flexWrap:'wrap' },
  actionBtn:       { paddingVertical:10, paddingHorizontal:14, borderRadius:10, backgroundColor:'#1a2235', borderWidth:1, borderColor:'#2a3d5c', minHeight:42, alignItems:'center', justifyContent:'center' },
  actionBtnText:   { fontSize:13, fontWeight:'700', color:'#8899bb' },
  actionBtnPrimary:{ backgroundColor:'#3b82f6', borderColor:'#3b82f6' },
  actionBtnGreen:  { backgroundColor:'#10b981', borderColor:'#10b981', flex:1 },
  actionBtnDanger: { borderColor:'rgba(239,68,68,.3)', backgroundColor:'rgba(239,68,68,.08)' },

  swipeTip:        { textAlign:'center', fontSize:10, color:'#3d5070', fontFamily:'Courier', paddingBottom:10, letterSpacing:.3 },
});
