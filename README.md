# PlaquistePro ERP
**Application cross-platform de gestion des livraisons pour plaquistes et jointeurs**
> React Native (Expo) · Firebase · Android · iOS · Web

---

## 🏗️ Architecture

```
plaquiste-erp/
├── src/
│   ├── App.tsx                          ← Point d'entrée, auth + data listeners
│   ├── store/index.ts                   ← Zustand state global
│   ├── services/
│   │   ├── firebase.ts                  ← Config Firebase + types + helpers
│   │   ├── pdfService.ts                ← Export PDF (bons de livraison + factures)
│   │   └── notificationService.ts       ← Push notifications (FCM + Expo)
│   ├── screens/
│   │   ├── auth/LoginScreen.tsx
│   │   ├── admin/
│   │   │   ├── AdminDashboard.tsx       ← KPIs + timeline + graphiques
│   │   │   ├── DeliveriesListScreen.tsx ← Liste + filtres + recherche
│   │   │   ├── DeliveryDetailScreen.tsx ← Détail + export PDF + Waze
│   │   │   ├── NewDeliveryScreen.tsx    ← Création livraison + matériaux
│   │   │   ├── StockScreen.tsx          ← Stock + alertes + barres progression
│   │   │   ├── ClientsScreen.tsx        ← Gestion clients
│   │   │   ├── IncidentsScreen.tsx      ← Incidents ouverts + résolution
│   │   │   └── StatsScreen.tsx          ← Graphiques + top chauffeurs
│   │   ├── driver/
│   │   │   ├── DriverScreen.tsx         ← Livraisons du jour + swipe gestures
│   │   │   └── SignatureScreen.tsx      ← Pad de signature tactile
│   │   └── client/
│   │       └── ClientTrackingScreen.tsx ← Suivi en temps réel
│   └── navigation/AppNavigator.tsx      ← Navigation par rôle
├── erp-demo.html                        ← Démo interactive complète (web)
├── firestore.rules                      ← Règles de sécurité Firestore
└── package.json
```

---

## 🗄️ Modèles de données Firebase

### `users/{uid}`
```typescript
{
  uid: string          // Firebase Auth UID
  email: string
  displayName: string
  role: 'admin' | 'driver' | 'client'
  phone?: string
  clientId?: string    // Pour les clients → lié à clients/{clientId}
  fcmToken?: string    // Token push notifications
  active: boolean
  createdAt: Timestamp
}
```

### `deliveries/{id}`
```typescript
{
  reference: string          // REF-2024-0042
  type: 'simple' | 'grouped'
  status: 'pending' | 'assigned' | 'in_transit' | 'delivered' | 'incident' | 'cancelled'
  priority: 'low' | 'normal' | 'urgent'
  clientId: string
  clientName: string
  address: string
  lat?: number; lon?: number
  driverId?: string; driverName?: string
  scheduledAt: Timestamp; startedAt?: Timestamp; deliveredAt?: Timestamp
  items: Array<{ name, qty, unit, unitPrice?, stockId? }>
  photos: string[]           // Firebase Storage URLs
  signature?: string         // base64 ou URL
  notes?: string
  price?: number; vatRate?: number
  invoicePdf?: string
}
```

### `stock/{id}`
```typescript
{
  name: string; ref: string
  category: 'plaques' | 'ossature' | 'enduits' | 'isolation' | 'visserie' | 'divers'
  unit: string; quantity: number; minQuantity: number
  unitPrice: number; location?: string; supplier?: string
  lastUpdated: Timestamp; active: boolean
}
```

### `incidents/{id}`
```typescript
{
  deliveryId: string; driverId: string; driverName: string
  type: 'damage' | 'missing' | 'wrong_address' | 'refused' | 'other'
  description: string; photos: string[]
  status: 'open' | 'in_review' | 'resolved'
  resolvedAt?: Timestamp; resolvedBy?: string
}
```

---

## 🔐 Permissions par rôle

| Action                          | Admin | Chauffeur | Client |
|---------------------------------|:-----:|:---------:|:------:|
| Créer une livraison             | ✅    | ❌        | ❌     |
| Voir toutes les livraisons      | ✅    | ❌        | ❌     |
| Voir ses propres livraisons     | ✅    | ✅        | ✅*    |
| Valider une livraison           | ✅    | ✅        | ❌     |
| Signer une livraison            | ✅    | ✅        | ❌     |
| Signaler un incident            | ✅    | ✅        | ❌     |
| Gérer le stock                  | ✅    | 📖 lecture| ❌     |
| Créer/modifier clients          | ✅    | ❌        | ❌     |
| Exporter PDF                    | ✅    | ✅        | ❌     |
| Voir les statistiques           | ✅    | ❌        | ❌     |

*Client voit uniquement ses livraisons liées à son `clientId`

---

## 🚀 Installation & Démarrage

### Prérequis
- Node.js ≥ 18
- Expo CLI : `npm install -g expo-cli eas-cli`
- Compte Firebase (projet Firestore + Auth + Storage + Messaging)

### 1. Cloner et installer
```bash
git clone https://github.com/votre-org/plaquiste-erp
cd plaquiste-erp
npm install
```

### 2. Configurer Firebase
Éditez `src/services/firebase.ts` et remplacez les valeurs :
```typescript
const firebaseConfig = {
  apiKey:            "VOTRE_API_KEY",
  authDomain:        "VOTRE_PROJECT.firebaseapp.com",
  projectId:         "VOTRE_PROJECT_ID",
  storageBucket:     "VOTRE_PROJECT.appspot.com",
  messagingSenderId: "VOTRE_SENDER_ID",
  appId:             "VOTRE_APP_ID"
};
```

### 3. Déployer les règles Firestore
```bash
firebase deploy --only firestore:rules
```

### 4. Créer le premier compte admin
Dans la console Firebase → Authentication → Ajouter un utilisateur.
Puis dans Firestore → `users/{uid}` → créer avec `role: "admin"`.

### 5. Lancer l'application
```bash
# Web (démo)
npm run web

# Android (émulateur ou device)
npm run android

# iOS
npm run ios
```

---

## 📦 Build de production

### Android APK / AAB
```bash
eas build --platform android --profile production
```

### iOS IPA
```bash
eas build --platform ios --profile production
```

### Configuration `eas.json`
```json
{
  "build": {
    "development": { "developmentClient": true, "distribution": "internal" },
    "preview":     { "distribution": "internal" },
    "production":  { "android": { "buildType": "apk" } }
  }
}
```

---

## 📱 Fonctionnalités par écran

### 🏠 Dashboard Admin
- KPIs animés (livraisons, livrés, alertes stock, incidents)
- Graphique 7 jours
- Timeline du jour avec statuts en direct
- Donut chart répartition statuts
- Alertes stock faible avec barres de progression

### 📦 Liste des livraisons
- Recherche temps réel (client, adresse, référence)
- Filtres : Toutes / Attente / Transit / Livrés / Incidents
- Tri par date de planification
- Accès rapide au détail + action "Livrer"

### 📋 Détail livraison
- Liste des matériaux avec quantités
- Bouton Waze → ouvre GPS directement
- Copie adresse presse-papier
- Photos de preuve
- Export PDF (bon de livraison avec logo, signature, TVA)
- Historique des modifications

### 🚛 Vue Chauffeur
- Livraisons triées par heure planifiée
- Swipe droite → valider avec signature
- Swipe gauche → signaler incident
- Bouton "Prendre en charge" pour passer en transit
- Vibration haptique sur chaque action

### ✍️ Signature tactile
- Canvas SVG multi-points, sensible au doigt
- Confirmation décrémente automatiquement le stock
- Export PDF optionnel après signature
- Vibration motif de confirmation

### 📍 Suivi Client
- Étapes visuelles de livraison (Confirmé → Préparé → En route → Livré)
- Nom du chauffeur assigné
- Liste des articles commandés
- Mise à jour en temps réel (Firestore onSnapshot)

### 🏭 Stock
- Barres de progression colorées (vert/orange/rouge)
- Alertes automatiques sous seuil minimum
- Décrémentation automatique après chaque livraison validée
- Historique des mouvements

### 📊 Statistiques (Admin)
- Graphique livraisons par jour / mois
- Taux de succès
- Délai moyen de livraison
- Classement chauffeurs
- CA facturé

---

## 🔔 Notifications Push

Les notifications sont envoyées via **Firebase Cloud Messaging (FCM)**.

| Événement                  | Destinataire   |
|----------------------------|----------------|
| Nouvelle livraison assignée| Chauffeur      |
| Livraison confirmée        | Admin + Client |
| Incident signalé           | Admin          |
| Stock sous seuil           | Admin          |

### Cloud Function (optionnel) pour notifs serveur
```typescript
// functions/src/index.ts
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
admin.initializeApp();

export const onDeliveryUpdate = functions.firestore
  .document('deliveries/{id}')
  .onUpdate(async (change) => {
    const after = change.after.data();
    const before = change.before.data();
    if (before.status === after.status) return;

    if (after.status === 'delivered') {
      // Notifier le client
      const clientUsers = await admin.firestore()
        .collection('users')
        .where('clientId', '==', after.clientId).get();
      const tokens = clientUsers.docs.map(d => d.data().fcmToken).filter(Boolean);
      if (tokens.length) {
        await admin.messaging().sendMulticast({
          tokens,
          notification: { title:'✅ Livraison reçue', body:`${after.reference} a été livré` }
        });
      }
    }
  });
```

---

## 🎨 Charte graphique

La charte graphique est entièrement personnalisable via les variables CSS (pour la démo web) et les constantes de style React Native.

### Couleurs principales
| Variable      | Valeur défaut | Usage                    |
|---------------|---------------|--------------------------|
| `--accent`    | `#3b82f6`     | Actions principales      |
| `--green`     | `#10b981`     | Succès, livré            |
| `--amber`     | `#f59e0b`     | En attente, alertes      |
| `--red`       | `#ef4444`     | Incidents, erreurs       |
| `--purple`    | `#8b5cf6`     | Admin, statistiques      |

### Typographie
- **Titres** : Plus Jakarta Sans 700–800
- **Corps** : Plus Jakarta Sans 400–600
- **Données** : JetBrains Mono (références, quantités, codes)

---

## 📄 Export PDF

Le PDF généré inclut :
- Logo et coordonnées de l'entreprise
- Informations client (raison sociale, SIRET, adresse)
- Tableau des matériaux livrés (ref, qté, P.U. HT, total HT)
- Sous-total HT, TVA, Total TTC
- Signature numérique du destinataire
- Photos de preuve (URLs)
- Pied de page avec date de génération

---

## 📞 Support

Pour toute question ou personnalisation :
- Remplacez `CHEF_TEL` dans firebase.ts par le vrai numéro
- Remplacez `COMPANY` dans pdfService.ts par vos coordonnées
- Ajoutez votre logo en base64 dans `COMPANY.logo`
