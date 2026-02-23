// ═══════════════════════════════════════════════
// src/services/firebase.ts
// Firebase init + typed Firestore helpers
// ═══════════════════════════════════════════════
import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore, collection, doc, onSnapshot,
  addDoc, updateDoc, deleteDoc, query,
  where, orderBy, limit, serverTimestamp,
  Timestamp, writeBatch, getDocs
} from 'firebase/firestore';
import {
  getAuth, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut,
  onAuthStateChanged
} from 'firebase/auth';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

// ─── CONFIG ─────────────────────────────────────
// Remplacez avec vos vraies clés Firebase
const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID",
  measurementId:     "YOUR_MEASUREMENT_ID"
};

const app     = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const db      = getFirestore(app);
export const auth    = getAuth(app);
export const storage = getStorage(app);

// ═══════════════════════════════════════════════
// FIRESTORE DATA MODELS
// ═══════════════════════════════════════════════

/**
 * COLLECTION: users/{uid}
 * Permissions: admin=all, driver=own+deliveries, client=own deliveries
 */
export interface UserDoc {
  uid:         string;
  email:       string;
  displayName: string;
  role:        'admin' | 'driver' | 'client';
  phone?:      string;
  avatar?:     string;
  clientId?:   string;   // for role=client
  fcmToken?:   string;   // push notification token
  createdAt:   Timestamp;
  lastSeen?:   Timestamp;
  active:      boolean;
}

/**
 * COLLECTION: clients/{clientId}
 */
export interface ClientDoc {
  id:          string;
  companyName: string;
  contactName: string;
  email:       string;
  phone:       string;
  address:     string;
  siret?:      string;
  notes?:      string;
  logo?:       string;
  totalOrders: number;
  createdAt:   Timestamp;
  active:      boolean;
}

/**
 * COLLECTION: deliveries/{deliveryId}
 * Sous-collection: deliveries/{id}/items (materiaux)
 */
export interface DeliveryDoc {
  id:           string;
  reference:    string;     // REF-2024-0042
  type:         'simple' | 'grouped';
  status:       'pending' | 'assigned' | 'in_transit' | 'delivered' | 'incident' | 'cancelled';
  priority:     'low' | 'normal' | 'urgent';

  clientId:     string;
  clientName:   string;
  address:      string;
  lat?:         number;
  lon?:         number;

  driverId?:    string;
  driverName?:  string;

  scheduledAt:  Timestamp;
  startedAt?:   Timestamp;
  deliveredAt?: Timestamp;

  items:        DeliveryItem[];
  photos:       string[];      // Firebase Storage URLs
  signature?:   string;        // base64 or URL
  notes?:       string;
  incidentNote?: string;

  price?:       number;
  vatRate?:     number;        // ex: 0.20
  invoicePdf?:  string;

  createdBy:    string;
  createdAt:    Timestamp;
  updatedAt:    Timestamp;
}

export interface DeliveryItem {
  id:       string;
  name:     string;
  ref?:     string;
  qty:      number;
  unit:     string;
  unitPrice?: number;
  stockId?: string;
}

/**
 * COLLECTION: stock/{productId}
 */
export interface StockDoc {
  id:           string;
  name:         string;
  ref:          string;
  category:     'plaques' | 'ossature' | 'enduits' | 'isolation' | 'visserie' | 'divers';
  unit:         string;
  quantity:     number;
  minQuantity:  number;   // seuil alerte
  unitPrice:    number;
  location?:    string;   // position entrepot
  supplier?:    string;
  lastUpdated:  Timestamp;
  active:       boolean;
}

/**
 * COLLECTION: incidents/{incidentId}
 */
export interface IncidentDoc {
  id:           string;
  deliveryId:   string;
  driverId:     string;
  driverName:   string;
  type:         'damage' | 'missing' | 'wrong_address' | 'refused' | 'other';
  description:  string;
  photos:       string[];
  status:       'open' | 'in_review' | 'resolved';
  resolvedAt?:  Timestamp;
  resolvedBy?:  string;
  createdAt:    Timestamp;
}

/**
 * COLLECTION: notifications/{notifId}
 */
export interface NotificationDoc {
  id:        string;
  userId:    string;
  title:     string;
  body:      string;
  type:      'delivery_new' | 'delivery_update' | 'stock_low' | 'incident';
  data?:     Record<string, string>;
  read:      boolean;
  createdAt: Timestamp;
}

// ═══════════════════════════════════════════════
// FIRESTORE SECURITY RULES (firestore.rules)
// ═══════════════════════════════════════════════
/*
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isAuth()  { return request.auth != null; }
    function isAdmin() { return isAuth() && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin'; }
    function isDriver(){ return isAuth() && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'driver'; }
    function isClient(){ return isAuth() && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'client'; }
    function ownUser() { return isAuth() && request.auth.uid == resource.data.uid; }

    // Users
    match /users/{uid} {
      allow read:  if isAuth() && (request.auth.uid == uid || isAdmin());
      allow write: if isAdmin() || (request.auth.uid == uid && request.resource.data.role == resource.data.role);
      allow create:if isAdmin();
    }

    // Clients
    match /clients/{clientId} {
      allow read:  if isAdmin() || (isClient() && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.clientId == clientId);
      allow write: if isAdmin();
    }

    // Deliveries
    match /deliveries/{deliveryId} {
      allow read:  if isAdmin()
                   || (isDriver() && resource.data.driverId == request.auth.uid)
                   || (isClient() && resource.data.clientId == get(/databases/$(database)/documents/users/$(request.auth.uid)).data.clientId);
      allow create: if isAdmin();
      allow update: if isAdmin()
                   || (isDriver() && resource.data.driverId == request.auth.uid
                       && request.resource.data.diff(resource.data).affectedKeys()
                          .hasOnly(['status','photos','signature','deliveredAt','startedAt','incidentNote','updatedAt']));
    }

    // Stock
    match /stock/{productId} {
      allow read:  if isAdmin() || isDriver();
      allow write: if isAdmin();
    }

    // Incidents
    match /incidents/{incidentId} {
      allow read:  if isAdmin() || (isDriver() && resource.data.driverId == request.auth.uid);
      allow create:if isDriver() || isAdmin();
      allow update:if isAdmin();
    }

    // Notifications
    match /notifications/{notifId} {
      allow read,update: if isAuth() && resource.data.userId == request.auth.uid;
      allow create:      if isAdmin();
    }
  }
}
*/

// ═══════════════════════════════════════════════
// TYPED SERVICE HELPERS
// ═══════════════════════════════════════════════

export const Services = {

  // AUTH
  auth: {
    login:   (email: string, password: string) =>
      signInWithEmailAndPassword(auth, email, password),
    logout:  () => signOut(auth),
    onChange: (cb: (u: any) => void) => onAuthStateChanged(auth, cb),
  },

  // USERS
  users: {
    listen: (cb: (users: UserDoc[]) => void) =>
      onSnapshot(collection(db, 'users'), snap =>
        cb(snap.docs.map(d => ({ id: d.id, ...d.data() } as UserDoc)))),

    create: async (data: Omit<UserDoc, 'uid' | 'createdAt'>) => {
      const cred = await createUserWithEmailAndPassword(auth, data.email, 'Temp123!');
      await updateDoc(doc(db, 'users', cred.user.uid), {
        ...data, uid: cred.user.uid, createdAt: serverTimestamp()
      });
      return cred.user.uid;
    },

    update: (uid: string, data: Partial<UserDoc>) =>
      updateDoc(doc(db, 'users', uid), data),

    updateFCMToken: (uid: string, token: string) =>
      updateDoc(doc(db, 'users', uid), { fcmToken: token }),
  },

  // DELIVERIES
  deliveries: {
    listenAll: (cb: (d: DeliveryDoc[]) => void) =>
      onSnapshot(
        query(collection(db, 'deliveries'), orderBy('scheduledAt', 'desc')),
        snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() } as DeliveryDoc)))
      ),

    listenByDriver: (driverId: string, cb: (d: DeliveryDoc[]) => void) =>
      onSnapshot(
        query(collection(db, 'deliveries'),
          where('driverId', '==', driverId),
          where('status', 'in', ['assigned', 'in_transit']),
          orderBy('scheduledAt', 'asc')),
        snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() } as DeliveryDoc)))
      ),

    listenByClient: (clientId: string, cb: (d: DeliveryDoc[]) => void) =>
      onSnapshot(
        query(collection(db, 'deliveries'),
          where('clientId', '==', clientId),
          orderBy('scheduledAt', 'desc'),
          limit(50)),
        snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() } as DeliveryDoc)))
      ),

    create: (data: Omit<DeliveryDoc, 'id' | 'createdAt' | 'updatedAt'>) =>
      addDoc(collection(db, 'deliveries'), {
        ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
      }),

    updateStatus: (id: string, status: DeliveryDoc['status'], extra?: Partial<DeliveryDoc>) =>
      updateDoc(doc(db, 'deliveries', id), {
        status, updatedAt: serverTimestamp(), ...extra
      }),

    addPhoto: async (deliveryId: string, uri: string) => {
      const blob    = await fetch(uri).then(r => r.blob());
      const path    = `deliveries/${deliveryId}/${Date.now()}.jpg`;
      const fileRef = ref(storage, path);
      await uploadBytes(fileRef, blob);
      const url     = await getDownloadURL(fileRef);
      const delivery = await getDocs(query(collection(db, 'deliveries'), where('__name__', '==', deliveryId)));
      const current  = delivery.docs[0]?.data()?.photos || [];
      await updateDoc(doc(db, 'deliveries', deliveryId), {
        photos: [...current, url], updatedAt: serverTimestamp()
      });
      return url;
    },
  },

  // STOCK
  stock: {
    listenAll: (cb: (s: StockDoc[]) => void) =>
      onSnapshot(
        query(collection(db, 'stock'), where('active', '==', true)),
        snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() } as StockDoc)))
      ),

    update: (id: string, qty: number) =>
      updateDoc(doc(db, 'stock', id), {
        quantity: qty, lastUpdated: serverTimestamp()
      }),

    decrementAfterDelivery: async (items: DeliveryItem[]) => {
      const batch = writeBatch(db);
      for (const item of items) {
        if (!item.stockId) continue;
        const ref = doc(db, 'stock', item.stockId);
        const snap = await getDocs(query(collection(db, 'stock'), where('__name__', '==', item.stockId)));
        const current = snap.docs[0]?.data()?.quantity || 0;
        batch.update(ref, { quantity: Math.max(0, current - item.qty), lastUpdated: serverTimestamp() });
      }
      await batch.commit();
    },
  },

  // INCIDENTS
  incidents: {
    create: (data: Omit<IncidentDoc, 'id' | 'createdAt'>) =>
      addDoc(collection(db, 'incidents'), { ...data, createdAt: serverTimestamp() }),

    listenAll: (cb: (i: IncidentDoc[]) => void) =>
      onSnapshot(
        query(collection(db, 'incidents'), orderBy('createdAt', 'desc')),
        snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() } as IncidentDoc)))
      ),

    resolve: (id: string, resolvedBy: string) =>
      updateDoc(doc(db, 'incidents', id), {
        status: 'resolved', resolvedAt: serverTimestamp(), resolvedBy
      }),
  },
};
