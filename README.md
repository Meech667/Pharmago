# PharmaGo

Application mobile de livraison de médicaments à domicile, construite avec **Expo / React Native** et **Firebase**.

PharmaGo met en relation trois types d'acteurs : les **clients** qui commandent leurs médicaments, les **pharmacies** qui préparent les commandes, et les **livreurs** qui les acheminent. Chaque rôle dispose de son propre espace dédié dans l'application.

---

## Sommaire

- [Aperçu fonctionnel](#aperçu-fonctionnel)
- [Stack technique](#stack-technique)
- [Structure du projet](#structure-du-projet)
- [Prérequis](#prérequis)
- [Installation](#installation)
- [Lancer l'application](#lancer-lapplication)
- [Comptes de démo](#comptes-de-démo)
- [Modèle de données Firestore](#modèle-de-données-firestore)
- [Cycle de vie d'une commande](#cycle-de-vie-dune-commande)
- [Variables d'environnement](#variables-denvironnement)

---

## Aperçu fonctionnel

### Espace Client

- Parcourir le catalogue des pharmacies disponibles et leurs produits
- Passer une commande : sélectionner des produits et/ou téléverser une ordonnance (image ou PDF)
- Choisir une adresse de livraison parmi plusieurs adresses sauvegardées
- Régler via une carte bancaire enregistrée
- Suivre l'état de la commande en temps réel (en attente → acceptée → en livraison → livrée)
- Noter et commenter le livreur après livraison
- Mettre des pharmacies en favoris pour commander plus rapidement
- Messagerie intégrée avec la pharmacie et le livreur

### Espace Pharmacie

- Recevoir et gérer les commandes entrantes (accepter ou refuser avec motif)
- Consulter les ordonnances jointes à une commande
- Gérer le catalogue produits : ajout, modification, stock, indication d'ordonnance requise
- Décompte automatique du stock à la confirmation et restitution en cas d'annulation
- Renseigner les horaires d'ouverture et l'adresse
- Messagerie avec les clients et les livreurs

### Espace Livreur

- Consulter les livraisons disponibles à accepter
- Suivre la route active avec un plan animé (pharmacie → client)
- Générer un code de livraison pour valider la remise au client
- Tableau de bord des gains : aujourd'hui, cette semaine, ce mois, total
- Consulter les avis clients et y répondre
- Messagerie avec les clients et les pharmacies

---

## Stack technique

| Couche | Technologie |
|---|---|
| Framework mobile | [Expo](https://expo.dev) 54 / React Native 0.81 |
| Langage | TypeScript 6 |
| Navigation | [Expo Router](https://expo.github.io/router/) 6 (file-based routing) |
| Backend | [Firebase](https://firebase.google.com/) (Auth + Firestore) |
| Animations | React Native Reanimated 4 |
| Polices | DM Serif Display · Outfit (via `@expo-google-fonts`) |
| Stockage local | AsyncStorage |
| Upload fichiers | Expo Image Picker / Manipulator |

---

## Structure du projet

```
src/
├── app/                  # Pages Expo Router (routing par fichier)
│   ├── index.tsx         # Écran de sélection du rôle
│   ├── (client)/         # Groupe client
│   ├── (pharmacy)/       # Groupe pharmacie
│   └── (delivery)/       # Groupe livreur
│
├── components/           # Composants réutilisables
│   ├── client/
│   ├── pharmacy/
│   ├── delivery/
│   ├── chat/
│   └── ui/               # Design system (boutons, cartes, champs…)
│
├── services/             # Couche d'accès aux données Firebase
│   ├── auth.ts
│   ├── orders.ts
│   ├── products.ts
│   ├── pharmacies.ts
│   ├── chat.ts
│   ├── addresses.ts
│   ├── payment-methods.ts
│   ├── favorites.ts
│   └── reviews.ts
│
├── hooks/
│   ├── use-auth.ts       # État d'authentification global
│   └── use-theme.tsx     # Mode clair / sombre
│
├── constants/
│   ├── theme.ts          # Tokens de design (couleurs, espacements, polices)
│   ├── order-status.ts   # Labels et couleurs des statuts de commande
│   └── fees.ts           # Frais de livraison (4,90 €)
│
├── utils/
│   ├── card-format.ts
│   ├── generate-invoice.ts
│   └── validation.ts
│
├── scripts/
│   └── seed-firebase.ts  # Peuplement de la base de données de démo
│
└── config/
    └── firebase.ts       # Initialisation Firebase
```

---

## Prérequis

- **Node.js** 18 ou supérieur
- **npm** 9 ou supérieur
- Un compte [Firebase](https://console.firebase.google.com/) avec un projet configuré (Authentication + Firestore)
- Pour tester sur appareil physique : l'application **Expo Go** ([iOS](https://apps.apple.com/app/expo-go/id982107779) / [Android](https://play.google.com/store/apps/details?id=host.exp.exponent))
- Pour iOS Simulator : macOS + Xcode
- Pour Android Emulator : Android Studio
- **`babel-preset-expo`** (devDependency) — requis pour le bundling Expo
- **`babel-plugin-module-resolver`** (devDependency) — requis pour la résolution de l'alias `@/`

---

## Installation

```bash
# 1. Cloner le dépôt
git clone <url-du-repo>
cd Pharmago

# 2. Installer les dépendances
npm install
```

> Si l'app ne se lance pas, relancer avec : `npx expo start -c` (vide le cache Metro)

### Configuration Firebase

Le projet est déjà connecté au projet Firebase `pharmago-inov`. Si vous déployez votre propre instance, mettez à jour `src/config/firebase.ts` avec vos propres clés :

```ts
const firebaseConfig = {
  apiKey: "VOTRE_API_KEY",
  authDomain: "votre-projet.firebaseapp.com",
  projectId: "votre-projet",
  storageBucket: "votre-projet.firebasestorage.app",
  messagingSenderId: "XXXXXXXX",
  appId: "XXXXXXXX",
};
```

### Peupler la base de données (optionnel)

Un script de seed est disponible pour créer les comptes de démo, les catalogues produits et les profils :

```bash
npx ts-node src/scripts/seed-firebase.ts
```

> Ce script réinitialise entièrement la base. Ne pas exécuter en production.

---

## Lancer l'application

```bash
# Démarrer le serveur de développement
npm start
# ou
npx expo start
```

Depuis le terminal, vous pouvez ensuite ouvrir l'application :

| Commande | Cible |
|---|---|
| `npm run ios` | Simulateur iOS (macOS uniquement) |
| `npm run android` | Émulateur Android |
| `npm run web` | Navigateur web |
| Scanner le QR code | Expo Go sur appareil physique |

---

## Comptes de démo

Tous les comptes ci-dessous utilisent le mot de passe `Azerty123`.

### Pharmacies

| Pharmacie | Email |
|---|---|
| Pharmacie Lumière | lumiere@pharmacie.fr |
| Pharmacie de l'Horloge | horloge@pharmacie.fr |
| Pharmacie du Soleil | soleil@pharmacie.fr |

> Pharmacie Lumière dispose de 20 produits (dont 5 sur ordonnance), l'Horloge de 12, le Soleil de 14.

### Livreurs

| Nom | Email |
|---|---|
| Kevin Dubois | kevin@livreur.fr |
| Sarah Martin | sarah@livreur.fr |
| Thomas Petit | thomas@livreur.fr |

### Clients

| Nom | Email | Adresses sauvegardées |
|---|---|---|
| Margot Dupont | margot@client.fr | 2 (Domicile Lyon + Bureau Lyon) |
| Pierre Lambert | pierre@client.fr | 3 (Appartement Paris + Parents + Travail) |
| Claire Moreau | claire@client.fr | 1 (Maison Paris 20e) |

---

## Modèle de données Firestore

| Collection | Description |
|---|---|
| `users/{uid}` | Profils de tous les utilisateurs (rôle, adresses, moyen de paiement, note…) |
| `orders/{id}` | Commandes avec leur cycle de vie complet |
| `products/{id}` | Produits d'une pharmacie (stock, prix, ordonnance requise) |
| `pharmacies/{id}` | Informations et statut des pharmacies |
| `conversations/{id}` | Fils de messagerie entre participants |
| `messages/{convId}/msgs/{id}` | Messages individuels (texte + pièces jointes) |
| `favorites/{id}` | Pharmacies mises en favoris par un client |
| `reviews/{id}` | Avis clients sur les livreurs |

---

## Cycle de vie d'une commande

```
Client passe la commande
        │
        ▼
   [pending]  ──────── Pharmacie refuse ──────► [rejected]
        │
        │  Pharmacie accepte
        ▼
   [accepted]
        │
        │  Livreur prend en charge
        ▼
  [in_delivery]
        │
        │  Livreur valide la remise (code)
        ▼
  [delivered]
```

À chaque changement de statut, le client reçoit une notification dans l'application.

---

## Variables d'environnement

Le projet n'utilise pas de fichier `.env`. La configuration Firebase est directement dans `src/config/firebase.ts`. Les clés Firebase côté client sont publiques par conception (sécurité gérée par les règles Firestore côté serveur).

Pour un déploiement en production, pensez à configurer des règles de sécurité Firestore strictes afin de restreindre l'accès aux données selon le rôle de l'utilisateur connecté.

---

## Licence

MIT
