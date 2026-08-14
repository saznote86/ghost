# Cahier des Charges - Ghost Avatar AI (v2.1.1)

Date de révision : 14 Août 2026  
Version du document : v2.1.1 — "Robustesse Reconnaissance Vocale & Démarrage Unifié"

## Changelog v2.1.1 ("Robustesse Reconnaissance Vocale & Démarrage Unifié")
- **Correction de la boucle infinie de redémarrage de la reconnaissance vocale** (`src/services/voice/recognitionManager.ts`) :
  - Réutilisation d'une instance unique persistante `SpeechRecognition` au lieu de la recréer à chaque redémarrage, éliminant les erreurs `aborted` en cascade propres à Chrome.
  - Gestion propre des changements de mode pendant l'écoute (interruption → relance automatique via le gestionnaire `onend`).
  - Réparation du compteur anti-boucle (max 3 redémarrages consécutifs) qui ne s'accumulait plus en raison d'une réinitialisation prématurée, garantissant l'arrêt propre de la reconnaissance en cas d'échecs répétés.
  - Nouveaux tests unitaires de robustesse et de régression (`src/tests/unit/RecognitionManager.test.ts`, cas `aborted` → `onend` sans création infinie d'instances).
- **Script de Démarrage Windows (`start.bat`)** : lancement en un clic de l'application (vérification de la présence de Node.js/npm, installation automatique des dépendances à la première exécution, ouverture du navigateur sur `http://localhost:3000`, puis démarrage du serveur Express + Vite via `npm run dev`).

## Changelog v2.1.0 ("Contrôle Système Natif, Inférence 100% On-Device & Guardrails v2.1")
- **Contrôle Système Natif v2.1** : Pont de communication binaire Native Messaging Host (`com.sarra.ghosthands`) multiplateforme (Windows, macOS, Linux), protocole Little-Endian, gestion des processus, fichiers, fenêtres, volume sonore et exécution de scripts isolés via `OSAutomationService` et `NativeHostCommunicator`.
- **Installateur Interactif du Native Host (`NativeHostInstaller.tsx`)** : Assistant guidé en 3 étapes (téléchargement du script `installer.py`, enregistrement des clés de registre/manifests JSON navigateur, validation Ping/Pong bidirectionnelle).
- **Sécurité Renforcée & 10 Règles d'Or de Sarra (`GuardrailsInjector.ts`)** :
  - *Règle 8 — Transparence Système* : Obligation d'annoncer l'action avec demande de confirmation explicite (`"Je vais [action]. Voulez-vous continuer ?"`).
  - *Règle 9 — Sandbox Obligatoire* : Isolation conteneurisée (Docker/venv) et verrouillage Niveau 3 avec saisie obligatoire de `"CONFIRMER"`.
  - *Règle 10 — Journal d'Audit Obligatoire* : Traçabilité absolue de chaque action système avec horodatage, durée d'exécution, statut et possibilité d'annulation (*Undo/Rollback*).
  - *Boucle d'Auto-Correction LLM* : Détection automatique des intentions système non confirmées et réécriture en 2 passes.
  - *Matrice de Risque à 3 Niveaux* : Niveau 1 (Réversible / Sans confirmation requise), Niveau 2 (Irréversible / Confirmation simple), Niveau 3 (Dangereux / Confirmation renforcée).
  - *Liste Noire de Commandes Destructrices* : Blocage instantané des commandes critiques (`rm -rf /`, `mkfs`, `format`, `dd`, fork bombs, etc.).
- **Mode Hors Ligne Total & Moteurs On-Device** : Intégration de WebLLM (`@mlc-ai/web-llm` / Llama 3.2, Qwen2.5, Phi-3.5), Whisper ONNX (`@xenova/transformers` pour la reconnaissance vocale locale) et Piper WASM (`piper-wasm` pour la synthèse vocale locale hors cloud).
- **Interface Utilisateur Étendue (10 Onglets)** : Panneau de configuration Secret (Ctrl+Shift+K) enrichi avec les onglets *Brain*, *LLM*, *Memory*, *Voice*, *Avatar*, *Personality*, *Ghost Hands*, *Interface*, *Audit* et *System*.
- **Assistant de Premier Démarrage (`WelcomeWizard.tsx`)** : Parcours guidé de diagnostic, de téléchargement et d'initialisation des modèles locaux avec `DownloadManager` (pause, reprise, persistance CacheStorage/IndexedDB).

---

## 1. Présentation du Projet

### 1.1 Contexte
Ghost Avatar AI est une application web full-stack et locale interactive offrant un avatar IA 3D/2D personnalisable (format VRM Three.js & flux vidéo), une interface de dialogue multimodale (Texte, Voix et Vision d'écran avec réveil continu "Hey Sarra"), un agent web autonome (Ghost Hands MV3), une passerelle d'automatisation système native (Native Messaging Host), ainsi qu'un overlay de diagnostic, de télémétrie et d'audit en temps réel.

### 1.2 Objectif
Offrir un compagnon IA universel, souverain et hautement sécurisé capable de fonctionner aussi bien avec des API Cloud haute performance qu'en autonomie locale totale sans aucune connexion internet (Air-Gapped), capable de piloter le navigateur et le système d'exploitation de l'utilisateur sous le strict contrôle des 10 Règles d'Or de Sécurité.

---

## 2. Périmètre Fonctionnel

### 2.1 Rendu Avatar 3D & Multimodalité
- Rendu 3D temps réel de modèles VRM via Three.js et `@pixiv/three-vrm`.
- Animation faciale synchronisée (visèmes lip-sync AA, IH, OU, EE, OH) tirée de l'analyse spectrale audio (`AnalyserNode`).
- Animation de repos procédurale (idle, micro-mouvements, respiration, clignements d'yeux).
- Support des arrière-plans vidéo et images pour avatars 2D ou hybrides cyberpunk.
- **Vision Multimodale d'Écran** : Capture d'écran active à la demande de l'utilisateur pour analyse de documents, d'interfaces et de fenêtres de travail.

### 2.2 Panneau de Configuration Sécurisé (Menu Secret Ctrl+Shift+K — 10 Onglets)
Le panneau de configuration est accessible via le raccourci clavier `Ctrl+Shift+K` ou l'icône de paramètres. La sélection de l'onglet actif (`activeConfigTab`) est persistée en `localStorage`.

#### 2.2.1 Onglet Brain (Sélection Moteurs & Cloud)
- Sélection du Mode d'Inférence (Auto, Cloud, Ollama, On-Device WebLLM, Fallback Offline).
- Fournisseurs LLM Cloud (Gemini 2.0 Flash, OpenAI GPT-4o, Groq, Mistral, Qwen, DeepSeek, Cerebras, SambaNova).
- Champ de saisie d'Endpoint personnalisé et gestionnaire local de Clé API.
- Grille de cartes de la bibliothèque `FREE_LLM_PROVIDERS` avec auto-configuration en 1 clic.

#### 2.2.2 Onglet LLM (Gestionnaire des Modèles On-Device)
- Liste des modèles téléchargeables pour inférence locale via WebGPU / WebLLM :
  - *Llama-3.2-1B-Instruct-q4f16_1-MLC* (Léger & Ultra-rapide)
  - *Llama-3.2-3B-Instruct-q4f16_1-MLC* (Équilibré)
  - *Qwen2.5-1.5B-Instruct-q4f16_1-MLC* (Multilingue & Code)
  - *Phi-3.5-mini-instruct-q4f16_1-MLC* (Raisonnement logique)
- Gestionnaire de téléchargement `DownloadManager` avec affichage de la vitesse (MB/s), barre de progression, boutons Pause/Reprise et vérification d'espace de stockage.

#### 2.2.3 Onglet Memory (Mémoire Épisodique & Graphe JARVIS)
- Interrupteur `memoryEnabled` avec compteur de mémoire (`X / 200 mémoires`).
- Extraction automatique post-réponse des faits biographiques, goûts et consignes de l'utilisateur.
- Visualisation interactive du Graphe de Connaissances Force-Directed (Graphe JARVIS 2D Canvas).
- Recherche textuelle et suppression unitaire ou globale des souvenirs.

#### 2.2.4 Onglet Voice (Reconnaissance & Synthèse Vocale Hybride)
- Ligne d'état d'écoute en temps réel : `Écoute : off / wake / command / dictation`.
- Sélection du Moteur STT : Web Speech API (navigateur) ou Whisper ONNX Local (`@xenova/transformers` - Whisper Base French).
- Sélection du Moteur TTS : Web Speech API (Local), ElevenLabs (Cloud), Piper WASM (Local sans cloud - Voix fr_FR-siwis-medium / fr_FR-upmc-medium).
- Détection continue du mot de réveil ("Hey Sarra" / "Hé Sara") avec Barge-in instantané ("Stop", "Silence", "Tais-toi").
- Bouton "Dépanner le micro" avec VU-mètre et analyse de spectre.

#### 2.2.5 Onglet Avatar (Rendu 3D & Visèmes)
- Importateur de fichiers modèles VRM (`.vrm`) et textures de Cyber Avatar.
- 7 curseurs de transformation 3D (Position X, Y, Z, Rotation X, Y, Z, Échelle) et bouton Reset.
- Testeur de visèmes et réglage de la sensibilité du Lip-Sync.

#### 2.2.6 Onglet Personality (Comportement & Prompts)
- Sélecteur de presets de personnalité (Sarra par défaut, Expert, Empathique, Critique, Cyber-Opérateur).
- Éditeur de System Prompt avec injection automatique des 10 Règles d'Or de Sécurité (`GuardrailsInjector`).

#### 2.2.7 Onglet Ghost Hands (Automatisation Web & Contrôle Système Natif)
- Indicateur visuel du statut du Native Messaging Host (Installé & Opérationnel / Émulation / Non installé).
- Bouton d'ouverture de l'installateur interactif `NativeHostInstaller`.
- Matrice des actions système supportées avec badges de risque colorés.
- Testeur manuel rapide : Lancement de la Calculatrice, Contrôle du volume (+10%), Inventaire des applications.
- Journal d'activité Ghost Hands avec filtre d'événements et journalisation des 10 dernières actions système.
- Configuration de l'identifiant d'extension Chrome MV3 et Whitelist de domaines web autorisés.

#### 2.2.8 Onglet Interface (Layout & Diagnostics)
- Modes d'affichage : 3D Immersif, Split-Screen (Navigateur côte-à-côte), Overlay Chat minimaliste.
- Interrupteur d'activation de l'overlay de diagnostics temps réel (`Ctrl+Shift+D`).

#### 2.2.9 Onglet Audit (Journal d'Audit Système & Rollback)
- Registre exhaustif des actions système exécutées avec horodatage, type d'action, description, niveau de risque et durée d'exécution.
- Visualisation détaillée du payload JSON de chaque action.
- Filtres par statut (Succès / Échec) et par niveau de risque (Niveau 1, 2, 3).
- Bouton "Annuler l'action" (*Rollback/Undo*) pour toutes les opérations réversibles (restauration de fichiers déplacés, réinitialisation du volume, etc.).
- Exportation du journal d'audit au format JSON / CSV.

#### 2.2.10 Onglet System (Monitoring & Santé Machine)
- Surveillance en temps réel de la plateforme OS détectée (Windows, macOS, Linux).
- Télémétrie des ressources matérielles : Utilisation CPU, RAM allouée, statut WebGPU / Canvas.
- État de connectivité (En ligne / Hors-ligne / Mode Air-Gap forcé).

---

### 2.3 Contrôle Système Natif (Native Messaging Host v2.1)

#### 2.3.1 Architecture du Pont de Communication
Le contrôle système repose sur un hôte natif binaire conforme à la spécification Chrome Native Messaging Host :
- **Identifiant officiel** : `com.sarra.ghosthands`
- **Protocole de communication** : Messages JSON encapsulés avec préfixe de longueur 4 octets en format binaire Little-Endian (UInt32LE).
- **Multiplexage & Corrélation** : Chaque commande émise transmet un `correlationId` unique garantissant l'association exacte de la réponse asynchrone sans blocage de l'interface.

#### 2.3.2 Catalogue des Actions Système Supportées
1. **Gestion des Applications (`open_app` / `open_application`)** :
   - Lancement d'exécutables et applications du système d'exploitation par nom usuel (Calculatrice, Éditeur de code, Navigateur, Terminal) ou chemin absolu.
   - Détection et inventaire des applications installées sur le système hôte.
2. **Contrôle Matériel & Système (`system_control`)** :
   - Réglage du volume sonore (valeur absolue en % ou incrémentielle).
   - Ajustement de la luminosité d'écran.
   - Mise en veille, extinction ou verrouillage de session (soumis à confirmation stricte).
3. **Opérations sur les Fichiers (`file_operation`)** :
   - Lecture de fichiers texte et logs locaux.
   - Déplacement, copie et renommage sécurisés de documents.
   - Suppression sécurisée avec copie de sauvegarde automatique en zone de quarantaine/corbeille pour permettre l'annulation (Undo).
4. **Gestion des Fenêtres (`window_control`)** :
   - Minimisation, maximisation, centrage et fermeture de fenêtres applicatives cibles.
5. **Exécution de Scripts & Commandes Shell (`execute_command`)** :
   - Exécution de commandes bash, powershell ou scripts python sous sandbox isolée.

---

### 2.4 Sécurité Renforcée & Les 10 Règles d'Or de Sarra

Toutes les actions entreprises par Sarra sont régies par la classe `GuardrailsInjector` et vérifiées en amont par `ActionValidationLayer` :

#### 2.4.1 Les 10 Règles d'Or
1. **Sincérité Absolue & Sans Fabrication** : Interdiction formelle d'inventer des faits. Déclaration explicite d'incertitude si une information est manquante.
2. **Respect de l'Utilisateur & de son Autonomie** : Priorité absolue aux choix et directives de l'utilisateur dans le cadre éthique et sécurisé.
3. **Intégrité des Outils & Absence de Destruction** : Préservation systématique de l'intégrité des fichiers, applications et données utilisateur.
4. **Priorité à la Vie Privée & Données Personnelles** : Aucun stockage ni transmission externe non autorisée de données confidentielles (mots de passe, numéros de cartes bancaires, clés d'accès).
5. **Vérification Rationnelle des Faits** : Recoupement avec la mémoire locale avant d'affirmer des faits critiques.
6. **Transparence des Limites** : Indication claire des capacités et limites d'exécution (navigateur, permissions accordées).
7. **Demande de Confirmation pour Actions Complexes** : Description succincte de toute modification d'état avec validation utilisateur.
8. **Transparence Système (Règle 8)** : Avant toute action système, formulation obligatoire de l'action selon le gabarit :  
   `"Je vais [description précise de l'action]. Voulez-vous continuer ?"`
9. **Sandbox Obligatoire (Règle 9)** : Tout script ou commande arbitraire doit s'exécuter dans un environnement isolé (Docker / conteneur / venv). En cas d'exécution directe demandée, saisie obligatoire de `"CONFIRMER"`.
10. **Journal d'Audit Obligatoire (Règle 10)** : Enregistrement inaltérable de chaque action dans la base d'audit avec horodatage, paramètres, statut et possibilité de rollback.

#### 2.4.2 Matrice de Classification des Risques
- **Niveau 1 — Réversible (Faible Risque)** : Actions sans impact destructif (ex: consultation de statut, ouverture d'application courante, modification du volume). Exécution fluide avec notification d'audit.
- **Niveau 2 — Irréversible (Risque Modéré)** : Actions modifiant des données ou l'état d'un fichier (ex: déplacement/suppression de fichier, modification de réglages système). Exige une confirmation explicite (orale ou clic).
- **Niveau 3 — Dangereux (Haut Risque)** : Commandes shell avancées, modifications système globales, scripts arbitraires. Exige une confirmation renforcée (boîte de dialogue modale avec saisie explicite de confirmation).

#### 2.4.3 Blacklist des Commandes Destructrices
Toute tentative d'exécution directe des motifs suivants est bloquée instantanément sans possibilité de forçage :
- `rm -rf /`, `rm -rf /*`, `rmdir /s /q c:\`
- `mkfs`, `format`, `fdisk`, `dd if=/dev/`
- `:(){:|:&};:` (Fork bomb)
- Modifications de permissions système non autorisées (`chmod -R 777 /`)

### 2.5 Démarrage de l'Application (Windows)

Le script `start.bat` (à la racine du projet) permet de lancer l'application en un clic :

1. **Vérification de l'environnement** : présence de Node.js et npm dans le PATH (messages d'erreur explicites en cas d'absence).
2. **Installation des dépendances** : `npm install` exécuté automatiquement lors de la première exécution si le dossier `node_modules` est absent.
3. **Ouverture du navigateur** : accès automatique à `http://localhost:3000` après ~3 secondes.
4. **Démarrage du serveur** : `npm run dev` (`tsx server.ts`), qui lance le serveur Express + Vite en mode développement (rechargement à chaud) sur le port `3000`.

Pour un déploiement en production, exécuter d'abord `npm run build` (génère `dist/server.cjs`) puis `npm start`.

---

## 3. Architecture Technique

```
+-----------------------------------------------------------------------------------+
|                            Ghost Avatar AI - v2.1.1                               |
+-----------------------------------------------------------------------------------+
|  [Interface React / Three.js VRM / Tailwind CSS / Motion]                         |
|  - SecretConfigPanel (10 Onglets) | ChatWindow | WebFrameWindow | NativeHostInstaller  |
+-----------------------------------------------------------------------------------+
|  [Store Zustand Global - useAppStore]                                             |
|  - États temps réel, mémoires, statuts de connexion, journaux d'audit, réglages   |
+-----------------------------------------------------------------------------------+
|  [Couche d'Intelligence & Inférence Hybride]                                      |
|  +---------------------------+  +--------------------------+  +------------------+ |
|  | Cloud Providers           |  | On-Device WebLLM         |  | Fallback Local   | |
|  | Gemini / OpenAI / Groq    |  | WebGPU Llama 3.2 / Qwen  |  | Règles & Cache   | |
|  +---------------------------+  +--------------------------+  +------------------+ |
+-----------------------------------------------------------------------------------+
|  [Pipeline Voix & Multimodalité]                                                  |
|  - STT : Web Speech API / Whisper ONNX Local (Base French)                        |
|  - TTS : Web Speech API / ElevenLabs / Piper WASM Local                           |
|  - Wake Word : "Hey Sarra" / Barge-in réactif par silence et phrases d'arrêt      |
+-----------------------------------------------------------------------------------+
|  [Sécurité, Validation & Audit]                                                   |
|  - GuardrailsInjector (10 Règles d'Or + Boucle d'auto-correction LLM)             |
|  - ActionValidationLayer (Matrice de Risque Niveaux 1-3 & Blacklist de commandes) |
|  - AuditLogger (Persistance IndexedDB, métriques d'exécution, moteur de Rollback) |
+-----------------------------------------------------------------------------------+
|  [Passerelle d'Exécution & Automatisation]                                        |
|  +-------------------------------------+  +-------------------------------------+ |
|  | Ghost Hands (Extension Chrome MV3)  |  | OSAutomationService                 | |
|  | Manipulation DOM, ReAct, Formulaires|  | NativeHostCommunicator (Little-End) | |
|  +-------------------------------------+  +-------------------------------------+ |
+-----------------------------------------------------------------------------------+
                                            |
                              [Native Messaging Host]
                            com.sarra.ghosthands (Python/OS)
                                            |
                       +--------------------+--------------------+
                       |                    |                    |
                  [Windows]              [macOS]              [Linux]
```

---

## 4. Persistance & Stockage

### 4.1 Base IndexedDB (`sarra-memory` & `ghostDB`)
- **`memories`** : Faits durables extraits des échanges avec catégories (*identité*, *goût*, *lieu*, *explicite*). Plafond à 200 items.
- **`auditLogs`** : Entrées détaillées des actions système avec horodatage, statut de succès, durée en ms et données de rollback.
- **`modelCache`** : Poids des modèles locaux ONNX et WASM (Whisper, Piper).

### 4.2 LocalStorage (`useAppStore`)
- Préférences d'interface, clé de l'onglet actif (`activeConfigTab`), modes d'inférence, identifiants d'extension et drapeaux de sécurité.

---

## 5. Matrice de Recette & Tests Automatisés

Le projet intègre une suite de tests unitaires et d'intégration validée via Vitest :
1. `src/tests/unit/GuardrailsInjectorSystem.test.ts` :
   - Vérification de l'injection intégrale des 10 règles d'or.
   - Validation de la détection de conformité de la Règle 8 (Transparence Système).
   - Détection et rejet des intentions système directes non confirmées.
2. `src/tests/integration/NativeHostIntegration.test.ts` :
   - Détection de disponibilité du Native Messaging Host.
   - Vérification de l'encapsulation de message et corrélation d'ID.
   - Résilience en cas d'absence de binaire externe.
3. `src/tests/integration/GhostHandsSystem.test.ts` :
   - Routage unifié des actions système via `GhostHandsService`.
   - Simulation du flux d'installation du Native Host.
   - Traçabilité et journalisation dans `AuditLogger`.
4. `src/tests/unit/RecognitionManager.test.ts` (v2.1.1) :
   - Un `onend` tardif après un arrêt intentionnel ne redémarre pas.
   - Un `onerror` tardif après un arrêt intentionnel est ignoré.
   - Un `onend` non intentionnel déclenche un redémarrage sur la même instance réutilisée (pas de recréation en boucle).
   - Régressions : l'enchaînement `aborted` → `onend` ne crée pas de boucle infinie de recréations d'instances.

---

## 6. Synthèse des Évolutions Futures (v2.2)

- **Adaptation Dynamique de Personnalité** : Exploitation du Graphe de Connaissances JARVIS pour moduler l'humour, le niveau de formalité et le débit en temps réel.
- **Morphing & Génération Procédurale VRM** : Personnalisation de l'avatar 3D à partir d'une photo de l'utilisateur.
- **Clonage Vocal Local** : Génération de profils vocaux personnalisés via modèles TTS on-device.
- **Gestion Multi-Profils** : Cloisonnement étanche des mémoires et espaces de travail pour plusieurs utilisateurs.
