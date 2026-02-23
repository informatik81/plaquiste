// src/services/notificationService.ts
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Services } from './firebase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  true,
  }),
});

export async function registerForPushNotifications(uid: string): Promise<string | null> {
  if (!Device.isDevice) return null;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return null;

  const token = await Notifications.getExpoPushTokenAsync({
    projectId: Constants.expoConfig?.extra?.eas?.projectId,
  });

  // Persist token to Firestore
  await Services.users.updateFCMToken(uid, token.data);

  // Android channel
  if (require('react-native').Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('deliveries', {
      name:       'Livraisons',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      sound:      'default',
    });
    Notifications.setNotificationChannelAsync('stock', {
      name:       'Stock',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  return token.data;
}

// Local notification helpers
export const LocalNotif = {
  deliveryAssigned: (ref: string, address: string) =>
    Notifications.scheduleNotificationAsync({
      content: {
        title: '🚚 Nouvelle livraison assignée',
        body:  `${ref} · ${address}`,
        sound: 'default',
        data:  { type: 'delivery_new' },
      },
      trigger: null,
    }),

  deliveryDelivered: (ref: string) =>
    Notifications.scheduleNotificationAsync({
      content: {
        title: '✅ Livraison confirmée',
        body:  `${ref} a été livré avec succès`,
        sound: 'default',
      },
      trigger: null,
    }),

  stockLow: (items: string[]) =>
    Notifications.scheduleNotificationAsync({
      content: {
        title: '⚠️ Stock faible',
        body:  `${items.slice(0,3).join(', ')}${items.length > 3 ? ` +${items.length-3}` : ''} sous le seuil`,
        data:  { type: 'stock_low' },
      },
      trigger: null,
    }),

  incident: (ref: string) =>
    Notifications.scheduleNotificationAsync({
      content: {
        title: '🚨 Incident signalé',
        body:  `Un incident a été signalé sur ${ref}`,
        sound: 'default',
        data:  { type: 'incident' },
      },
      trigger: null,
    }),
};
