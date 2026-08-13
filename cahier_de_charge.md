# Cahier des Charges - Ghost Avatar AI (v1.6.0)

Date de révision : 12 Août 2026
Version du document : v1.6.0

## Changelog v1.6.0 ("Sarra incarnée")
Changelog v1.6.0 : Identité Sarra par défaut (preset `sarra` avec prompt d'agent autonome, indicateurs visuels top-left "Sarra", "Sarra réfléchit...", "Sarra parle..."), mémoire persistante autonome IndexedDB (`sarra-memory` avec extraction LLM post-réponse, rappel contextuel dynamique, plafond à 200 mémoires, et gestion dans l'onglet Personality), recherche directe sans saisie (`searchUrlTemplate` pour YouTube, Google, DuckDuckGo, Wikipedia, Bing avec nettoyage automatique de requêtes), cohérence du store Zustand (`wakeWordEnabled` persisté, `recognitionState` en runtime pur), note de confidentialité sur la reconnaissance vocale.

---

## 1. Présentation du Projet

### 1.1 Contexte
Ghost Avatar AI est une application web full-stack interactive et modulaire offrant un avatar IA 3D/2D personnalisable (format VRM Three.js & flux vidéo), une interface de dialogue multimodale (Texte & Voix avec réveil continu "Hey Sarra"), un agent web autonome (Ghost Hands), un navigateur web intégré avec proxy anti-blocage, ainsi qu'un overlay de diagnostic, de télémétrie microphone et de configuration en temps réel.

### 1.2 Objectif
Fournir une plateforme unifiée, fluide et hautement résiliente permettant à l'utilisateur d'interagir naturellement avec un assistant virtuel tout en déléguant des tâches web complexes, avec une tolérance optimale aux erreurs d'infrastructure cloud (401, 403, 429), un dépannage matériel guidé et une bascule intelligente vers des services locaux ou gratuits.

---

## 2. Périmètre Fonctionnel

### 2.1 Rendu Avatar 3D & Vidéo
- Rendu 3D temps réel de modèles VRM via Three.js et @pixiv/three-vrm.
- Animation faciale synchronisée (visèmes lip-sync AA, IH, OU, EE, OH) tirée de l'analyse spectrale audio.
- Animation de repos (idle, respiration, clignements d'yeux).
- Support des arrière-plans vidéo ou images pour avatars 2D/hybrides.

### 2.2 Panneau de Configuration Sécurisé (Menu Secret Ctrl+Shift+K)
Le panneau de configuration est accessible via le raccourci clavier Ctrl+Shift+K ou l'icône de paramètres. Il est structuré en 6 onglets distincts. La valeur de l'onglet actif (activeConfigTab) est persistée en localStorage. Quand l'utilisateur rouvre le panneau avec Ctrl+Shift+K, il s'ouvre sur le dernier onglet visité. Par défaut, si aucune valeur n'est persistée, l'onglet Brain est affiché.

#### 2.2.1 Onglet Brain (LLM & Intelligence)
- Sélection du Mode LLM (Auto, Cloud, Ollama, Offline).
- Fournisseur LLM principal (Gemini, OpenAI, Qwen, Groq, Mistral, etc.).
- Champ de saisie d'Endpoint personnalisé et Clé API.
- Interrupteur de Fallback offline (bascule automatique en cas de rupture réseau).
- Configuration Ollama (URL d'instance et nom du modèle).
- Grille de cartes de la bibliothèque FREE_LLM_PROVIDERS avec bouton "Utiliser" et lien "Obtenir ma clé".

#### 2.2.2 Onglet Voice (Synthèse Vocale & Reconnaissance)
- Ligne d'état d'écoute en temps réel : `Écoute : off / wake / command / dictation` avec pastille lumineuse d'état.
- Bouton "Dépanner le micro" ouvrant le modal interactif de diagnostic microphone.
- Interrupteur de détection vocale continue ("Hey Sarra" / Wake Word), avec désactivation automatique et mention "Non supporté" sur les navigateurs sans Web Speech API (ex: Firefox).
- Sélection du Moteur vocal actif (System / Web Speech API, ElevenLabs).
- Clé API ElevenLabs et sélecteur de voix d'avatar.
- Curseur de vitesse vocale (speed) de 0.5x à 2.0x (mapped sur utterance.rate).
- Curseur de hauteur vocale (pitch) de 0.5 à 1.8 (mapped sur utterance.pitch).
- Grille de cartes de la bibliothèque FREE_TTS_PROVIDERS avec liens d'inscription.
- Bouton "Tester la voix" pour la pré-écoute immédiate.

#### 2.2.3 Onglet Avatar (Rendu & Contrôles)
- Bouton de chargement d'image personnalisée depuis le PC pour le Cyber Avatar AI (remplaçant cyber_avatar.jpg) avec aperçu miniature et réinitialisation.
- Formulaire d'importation de fichier modèle VRM personnalisé (.vrm).
- Importation de vidéos d'arrière-plan (idle et talking).
- 7 curseurs de transformation 3D (Position X, Y, Z, Rotation X, Y, Z, Échelle).
- Bouton de réinitialisation des transformations (Reset).

#### 2.2.4 Onglet Personality (Comportement & Prompts)
- Sélecteur de presets de personnalité (Sarra par défaut, Expert, Empathique, Critique, Qwen Ghost).
- Zone de texte éditable pour le System Prompt personnalisé de l'IA (directives d'agent autonome Sarra).
- Section "Mémoire de Sarra" : interrupteur `memoryEnabled` (persisté, défaut true), compteur de mémoires (`X / 200 mémoires`), liste des 20 dernières mémoires enregistrées avec badges de catégories, boutons d'effacement individuel et bouton "Tout effacer".

#### 2.2.5 Onglet Ghost Hands (Agent Web Autonome)
- Case à cocher d'activation de l'agent autonome Ghost Hands.
- Champ de saisie de l'ID de l'extension Chrome (ghostHandsExtensionId).
- Case à cocher de narration vocale des actions d'agent.
- Bouton "Tester l'extension" pour valider la poignée de main (ping/pong).
- Indicateur visuel du statut de connexion avec l'extension.

#### 2.2.6 Onglet Interface (Layout & Diagnostics)
- Boutons de mise en page (Immersive 3D, Split-Screen, Overlay chat).
- Toggle d'activation du Panneau de Diagnostics (diagnosticEnabled).
- Options visuelles et thèmes futurs.

### 2.3 Navigateur WebFrame Integrated
- Rendu de sites web au sein d'une fenêtre dédiée en superposition ou mode côte-à-côte.
- Proxy inverse serveur Express (/api/proxy) supprimant les en-têtes X-Frame-Options et CSP.
- Barre d'adresse avec favoris rapides (Google, Wikipedia, DuckDuckGo, Archive.org).
- Mode plein écran conservant l'avatar IA et le statut d'agent visibles en superposition.

### 2.4 Agent Web Autonome (Ghost Hands)
- Décomposition d'objectifs utilisateur en plans d'actions séquentiels (navigate, type, click, read, read_all_text, wait, highlight).
- Exécution via Extension Chrome dédiée v3 ou via le composant WebFrame en mode direct (Fallback).
- Journal d'exécution temps réel des étapes franchies par l'agent.

### 2.5 Résilience & Gestion des Erreurs Cloud (401, 403, 429)
- Interception centralisée des réponses HTTP en échec de la part des API cloud LLM et TTS.
- Traitement adapté selon le code d'erreur :
  - Sur erreur 401 ou 403 : Un bandeau d'alerte apparaît en haut du chat avec le message "Clé API invalide ou expirée" et un bouton "Configurer". Au clic sur ce bouton, le panneau de configuration s'ouvre sur l'onglet Brain. Le panneau de diagnostics ne s'ouvre PAS automatiquement.
  - Sur erreur 429 : Un bandeau d'alerte apparaît avec le message "Quota dépassé ou limite de requêtes atteinte" et un bouton "Voir les providers gratuits". Au clic, le panneau de configuration s'ouvre sur l'onglet Brain et la grille FREE_LLM_PROVIDERS est mise en avant (scroll automatique vers la grille). Le panneau de diagnostics ne s'ouvre PAS automatiquement.
  - Sur erreur ElevenLabs 401 ou 429 : Bascule automatique vers System, message discret "Voix ElevenLabs indisponible. Bascule sur la voix système." affiché dans le chat, mise à jour du moteur vocal dans le store. Pas d'ouverture automatique du panneau.
  - Le panneau de diagnostics (Ctrl+Shift+D) est un outil de debug manuel, jamais ouvert automatiquement par une erreur.

### 2.5bis — Bibliothèque de providers LLM gratuits et freemium
Tous les providers de la bibliothèque FREE_LLM_PROVIDERS utilisent le pattern OpenAI-compatible /chat/completions et sont donc compatibles avec l'abstraction LLMProvider existante sans modification du service.

Tableau des providers LLM gratuits :

Identifiant | Nom affiché | Endpoint | Modèle par défaut | Clé API requise | Plan gratuit | Lien d'inscription | Badge
groq | Groq | https://api.groq.com/openai/v1 | llama-3.3-70b-versatile | requise | 30 requêtes par minute | https://console.groq.com/keys | GRATUIT
together-ai | Together AI | https://api.together.xyz/v1 | meta-llama/Llama-3.3-70B-Instruct-Turbo-Free | requise | crédits offerts à l'inscription | https://api.together.xyz/settings/api-keys | FREEMIUM
mistral | Mistral AI | https://api.mistral.ai/v1 | mistral-small-latest | requise | tier expérimental gratuit | https://console.mistral.ai/api-keys | FREEMIUM
google-ai-studio | Google AI Studio | https://generativelanguage.googleapis.com/v1beta/openai | gemini-2.0-flash | requise | 1500 requêtes par jour | https://aistudio.google.com/app/apikey | GRATUIT
openrouter | OpenRouter | https://openrouter.ai/api/v1 | meta-llama/llama-3.3-70b-instruct:free | requise | modèles gratuits via agrégateur | https://openrouter.ai/keys | FREEMIUM
cerebras | Cerebras | https://api.cerebras.ai/v1 | llama-3.3-70b | requise | inférence rapide gratuite | https://cloud.cerebras.ai/platform | GRATUIT
sambanova | SambaNova | https://api.sambanova.ai/v1 | Meta-Llama-3.3-70B-Instruct | requise | API gratuite | https://cloud.sambanova.ai/apis | GRATUIT
github-models | GitHub Models | https://models.inference.ai.azure.com | gpt-4o-mini | requise (token GitHub) | gratuit avec compte GitHub | https://github.com/settings/tokens | GRATUIT

### 2.6 Authentification Externalisée & Prise en Charge Qwen / OAuth
- Bandeau explicatif pour les services restreints par Google OAuth au sein des iframes (ex: chat.qwen.ai).
- Bouton de redirection vers un nouvel onglet externe préservant la session et les cookies utilisateur.

### 2.7 Diagnostic, Télémétrie & Dépannage Microphone
- **Diagnostic Microphone au Démarrage (`micDiagnosticService.ts`)** : Vérification automatique au chargement des API Web Audio, des périphériques connectés (`audioinput`), des autorisations navigateur et du moteur de reconnaissance vocal.
- **Bandeau Toast d'Alerte au Démarrage (`MicDiagnosticToast.tsx`)** : Affichage automatique d'une bannière haute si le microphone est bloqué, absent ou indisponible, munie d'un bouton direct "Dépanner".
- **Modal Interactif de Dépannage (`MicTroubleshootModal.tsx`)** :
  - Vu-mètre de niveau audio en direct avec analyse spectrale (`AudioContext` + `AnalyserNode`).
  - Test d'accès direct par clic déclenchant la demande de permission `getUserMedia`.
  - Guides pas à pas (autorisation cadenas navigateur, déblocage système, contournement iframe/nouvel onglet, compatibilité navigateurs).
- **Diagnostic Acoustique & Lip-Sync** :
  - Analyse du niveau sonore et VU-Mètre visuel.
  - Graphique temporel du signal audio (sparkline).
  - Visualisation des valeurs des voyelles en temps réel.

### 2.8 Présence Locale (Mode Offline)
- Moteur de réponse autonome basé sur des règles et patterns conversationnels locaux lorsque le réseau est indisponible ou sur décision utilisateur.

### 2.9 Reconnaissance Vocale Unifiée (`recognitionManager.ts`)
- **Instance Unique Exclusive** : Gestion centralisée de la reconnaissance vocale interdisant la création concurrente d'instances `SpeechRecognition` ou `webkitSpeechRecognition`.
- **Machine à États d'Écoute (`recognitionState`)** :
  - `off` : Écoute désactivée.
  - `wake` : Écoute en arrière-plan pour le mot de réveil ("Hey Sarra" / "Hé Sara").
  - `command` : Attente active de la commande suite au réveil (Sarra répond "Oui ?").
  - `dictation` : Saisie vocale directe via le bouton micro.
- **Barge-in & Phrases d'Arrêt** : Interruption vocale immédiate ("tais-toi", "silence", "stop", "chut") arrêtant le flux TTS et réinitialisant l'état d'élocution.
- **Filtre Anti-Écho** : Registre du texte émis par Sarra (`setCurrentTtsText`) afin d'éviter que Sarra ne réponde à sa propre élocution.

### 2.9bis Moteur de Synthèse Vocale (TTS) & Clarification Speed/Pitch
- Support de Web Speech API (local) et d'ElevenLabs (cloud).
- Clarification technique : Le curseur speed de l'interface mappe vers utterance.rate pour le moteur Web Speech API. Pour ElevenLabs, la vitesse est appliquée via playbackRate sur l'AudioContext si techniquement simple, sinon le curseur est grisé avec la mention 'Non supporté pour ce moteur'. Le pitch est supporté nativement par Web Speech API (utterance.pitch) et n'est pas supporté par ElevenLabs (curseur grisé).

### 2.9ter — Bibliothèque de providers TTS gratuits et freemium
Seuls les providers marqués "actif" sont fonctionnels en v1.5. Les providers marqués "prévu" sont affichés dans l'interface avec un badge "Bientôt" et un lien d'inscription, mais ne sont pas encore implémentés.

Tableau des providers TTS :

Identifiant | Nom affiché | Type | Clé API requise | Plan gratuit | Lien d'inscription | Badge | Statut d'implémentation
system | Voix système (Web Speech) | local | aucune | illimité | N/A | GRATUIT | actif
elevenlabs | ElevenLabs | cloud | requise | ~10000 caractères / mois | https://elevenlabs.io/app/settings/api-keys | FREEMIUM | actif
openai-tts | OpenAI TTS | cloud | requise | essai possible | https://platform.openai.com/api-keys | PAYANT | prévu
google-cloud-tts | Google Cloud TTS | cloud | requise | quota gratuit Google Cloud | https://console.cloud.google.com/apis/library/texttospeech.googleapis.com | FREE_TIER | prévu
azure-speech | Azure Speech | cloud | requise | quota gratuit Azure | https://portal.azure.com | FREE_TIER | prévu
huggingface-tts | Hugging Face TTS | cloud | requise | Inference API limitée | https://huggingface.co/settings/tokens | GRATUIT_LIMITÉ | prévu
playht | Play.ht | cloud | requise | plan gratuit limité | https://play.ht/dashboard/api-access | FREEMIUM | prévu

### 2.10 Overlay et Interface Utilisateur Responsive
- Layouts adaptatifs pour desktop et mobile.
- Support du mode sombre / cyberpunk high-contrast.

### 2.11 Télémétrie VRM et Contrôles
- Sliders d'ajustement manuel des visèmes à des fins de test.

### 2.12 Panneau de diagnostics (optionnel)
- Contenu affiché : Provider LLM actif, mode LLM actif, moteur TTS actif, état speaking / thinking / idle, état Ghost Hands, état reconnaissance vocale (`recognitionState`), dernière erreur HTTP known, nombre de phrases dans la file TTS, niveau audioLevel approximatif.
- Accès : Raccourci clavier Ctrl+Shift+D pour toggle, ou toggle dans l'onglet Interface du panneau de configuration.
- Style : Petit panneau flottant en bas à gauche, esthétique sombre et cyan cohérente avec l'application, désactivé par défaut (diagnosticEnabled: false).
- Comportement : Aucun appel réseau, lecture seule de l'état du store, pas de logs verbeux.

### 2.13 Mode JARVIS — Second Cerveau Vocal
Intégration des 5 concepts clés de JARVIS dans Ghost Avatar AI sans modifier l'architecture frontend-only existante :
1. **Graph de Connaissances Force-Directed (`KnowledgeGraph.tsx`)** :
   - Visualisation 2D sur canvas HTML5 avec physique d'attraction/répulsion et amortissement.
   - Nœuds issus des mémoires de Sarra (IndexedDB), des conversations récentes et des sites visités par Ghost Hands.
   - Couleurs par catégorie (identité = cyan, goût = magenta, lieu = vert, explicite = blanc).
   - Effet visuel de pulsation en mode idle et animation de pulses le long des arêtes.
   - Interactivité complète : survol avec mise en valeur, sélection de nœuds, recherche de chemin le plus court (algorithme BFS) et recherche textuelle.
2. **Turn-Taking par Silence (`silenceTurnTaking.ts`)** :
   - Détection continue des fins de parole avec Web Audio API (`AnalyserNode`).
   - Seuil de silence fixé à `< -40dB` pendant `900ms` pour déclencher la fin de tour.
   - Mode conversation continue : relance automatique de la dictation vocalement dès que Sarra termine sa réponse orale.
   - Interruption instantanée (Barge-In) avec la touche Espace ou clic sur l'avatar pour couper la synthèse vocale et écouter l'utilisateur.
3. **Double Sortie Voix / Carte (`ResponseCard.tsx`)** :
   - Émission orale d'une phrase courte (1-2 phrases) via le pipeline TTS.
   - Affichage simultané d'une carte visuelle détaillée contenant la réponse complète, les faits cités, les liens sources et les nœuds du graphe liés.
   - Boutons d'action interactifs : "Mémoriser" (ajout instantané à la mémoire), "Ouvrir Source" et "Mémoriser dans le Graphe".
4. **Guardrails Stricts JARVIS** :
   - *Never invent* : En cas d'absence de fait en mémoire ou contexte, réponse stricte de 4 mots : *"Je ne sais pas."*
   - *Never send* : Refus systématique d'envoyer un message ou poster un formulaire sans confirmation vocale explicite.
   - *Never spend* : Refus automatique de tout formulaire de paiement.
   - *Never write silently* : Confirmation orale systématique des faits mémorisés.
   - *Never state a derived number without qualifier* : Précision explicite des nombres partiels ou conditionnels.
5. **Outils Contextualisés JARVIS (`jarvisTools.ts`)** :
   - `search_brain(goal)` : Interroge la mémoire IndexedDB de Sarra et génère une carte mémoire.
   - `research_web(goal, context)` : Effectue une recherche web via Ghost Hands et compare les résultats au contexte utilisateur.
   - `remember(fact)` : Enregistre le fait en base IndexedDB et met à jour le graphe de connaissances.
   - `brief_me()` : Synthèse en lecture seule de l'agenda (Google Calendar) et de la boîte de réception (Gmail) croisée avec les mémoires de Sarra (identité/lieu/goût/explicite), identification des éléments en souffrance ("ce qui a glissé"), sortie double voix/carte avec dégradation propre si Google est inaccessible.
   - `plan_day(calendarInaccessible?)` : Génération de 5 items maximum ordonnés par impact financier ("ce qui fait avancer l'argent"), croisant agenda, emails et mémoires. En cas d'agenda illisible, application du guardrail *Never invent* ("Je ne vois pas ton agenda") et planification basée exclusivement sur la mémoire sans inventer de rendez-vous.

---

## 3. Architecture Technique

### 3.1 Structure du Projet
Projet Web Full-Stack Express / Vite avec composants React et services modularisés :
- src/components : Composants UI (ChatWindow, HeaderBar, SecretConfigPanel, WebFrameWindow, DiagnosticPanel, VRMCanvas, MicDiagnosticToast, MicTroubleshootModal).
- src/hooks : Hooks personnalisés (useGhostAgent, useVoiceInput, useWakeWord, useAudioAnalyser).
- src/services : Services métier (llmStreamingService, TTSStreamingService, ghostHandsService, dbService, voice/recognitionManager, voice/micDiagnosticService).
- src/store : Store d'état global Zustand (useAppStore).
- qwen-chrome-extension : Code source de l'extension Chrome Manifest v3.
- server.ts : Serveur backend Express / Vite proxy.

### 3.2 Diagramme de Flux LLM & Reconnaissance Vocale
Entrée Utilisateur (Texte / recognitionManager) -> useGhostAgent -> llmStreamingService -> (API Cloud / Ollama / Fallback Offline) -> Réception du flux textuel -> Dispatch vers Chat & TTSStreamingService -> VRM Lip-Sync & Anti-Echo `setCurrentTtsText`.

### 3.3 Pipeline de Gestion d'Erreur LLM
Erreur HTTP lors du flux LLM :
- Si HTTP 401 / 403 : Interception par llmStreamingService -> Inscription de la notification d'erreur dans le store -> Affichage du bandeau alerte 401 dans ChatWindow -> Clic utilisateur sur "Configurer" -> Ouverture du panneau Secret sur l'onglet Brain. Le panneau de diagnostics ne s'ouvre PAS automatiquement.
- Si HTTP 429 : Interception par llmStreamingService -> Inscription de la notification d'erreur dans le store -> Affichage du bandeau alerte 429 dans ChatWindow -> Clic utilisateur sur "Voir les providers gratuits" -> Ouverture du panneau Secret sur l'onglet Brain avec mise en avant de la grille FREE_LLM_PROVIDERS.
- Si Rupture Réseau : Inscription notification -> Bascule automatique en mode Offline (streamOfflineCompletion).

### 3.3bis Pipeline de Gestion d'Erreur Ghost Hands
Erreur HTTP lors de l'appel LLM non-stream dans Ghost Hands :
Objectif utilisateur -> actionPlanner.ts -> callActiveLLMOnce() -> (Erreur 401 / 403 / 429) -> En cas d'erreur 401, 403 ou 429 lors de l'appel LLM non-stream, le planner bascule vers createLocalFallbackPlan() et affiche un log explicite dans le journal Ghost Hands indiquant la raison de la bascule -> Exécution du plan secours local.

### 3.4 Serveur Proxy Reverse Express
Requête WebFrame (/api/proxy?url=...) -> Express Server -> Nettoyage Headers (X-Frame-Options, CSP) -> Injection base URL -> Renvoi du flux HTML / Assets vers l'iframe Client.

### 3.5 Extension Chrome Ghost Hands Communication
Client Web (Zustand Store) <-> chrome.runtime.sendMessage <-> Extension Ghost Hands (Background / Content Script) <-> DOM Onglet Actif.

### 3.5bis Gestion des fenêtres et cycle de vie Ghost Hands
- **controlledWindowId** : La variable globale de l'extension conserve l'identifiant de la fenêtre Chrome contrôlée par Ghost Hands. L'ordre de priorité pour sélectionner la fenêtre cible est : 1) `targetWindowId` explicite si fourni, 2) `controlledWindowId` si la fenêtre existe toujours (vérifié via `chrome.windows.get`), 3) la fenêtre active par défaut.
- **Ouverture directe des liens dans le navigateur** : Les liens et fenêtres web demandés par l'utilisateur sont ouverts directement dans le navigateur réel (`window.open(url, '_blank')` en mode Web / `chrome.windows.create({ url, focused: true })` en mode Extension), plutôt que d'être affichés dans l'iframe interne de l'application.
- **Maintien Persistant du WebFrame (`WebFrameWindow`)** : Le composant WebFrame reste constamment monté dans le DOM, même en mode "avatar seul" (masqué via positionnement hors-écran / visibilité CSS). Cela garantit que le Mode Direct WebFrame de Ghost Hands exécute la navigation et l'interaction DOM sans destruction ni remontage d'iframe.
- **Dictionnaire `SITE_ALIASES` & Mode Offline** : Le planificateur secours local intègre un dictionnaire d'alias de sites (`whatsapp` -> `https://web.whatsapp.com`, `youtube` -> `https://www.youtube.com`, `google` -> `https://www.google.com`, `wikipedia` -> `https://fr.wikipedia.org`, `duckduckgo` -> `https://duckduckgo.com`, `qwen` -> `https://chat.qwen.ai`, `gmail` -> `https://mail.google.com`, `maps` -> `https://maps.google.com`). Tout ordre contenant un alias ("lance WhatsApp", "ouvre google") génère immédiatement un plan `navigate` ou `new_window` vers l'URL correspondante, sans dépendance LLM Cloud.
- **Saisie d'Ordres & Détection de Délégation en Mode Avatar Seul** :
  - Un bouton flottant discret "Donner un ordre" situé près de l'avatar ouvre un champ à une ligne pour exécuter directement des commandes Ghost Hands.
  - Un détecteur de verbes d'action (`ouvre`, `ouvre-moi`, `lance`, `va sur`, `navigue vers`, `cherche`, `affiche`) dans le flux conversationnel et vocal permet la délégation en 1 clic.
  - Le raccourci `Ctrl+Shift+K` est préservé pour le panneau de configuration.
- **Feedback Visuel en Mode Avatar Seul** : Durant l'exécution de Ghost Hands (`ghostHandsStatus === 'planning' | 'executing'`), un cadre lumineux cyan entoure l'écran (`set_controlling`), un mini-journal de 3-4 lignes apparaît près de l'avatar avec fondu automatique (4.5s) après exécution, et la narration vocale énonce chaque étape.
- **Réveil Service Worker MV3 & Retry** : Les appels IPC `sendGhostAction` incluent un mécanisme de tentative de réveil si le Service Worker Manifest V3 est endormi (erreurs `Receiving end does not exist` ou `Could not establish connection`). Une réémission est effectuée après 600ms avec journalisation. En cas d'échec persistant, l'erreur explicite `"Extension Ghost Hands endormie ou non chargée"` est retournée.
- **Watchdog 60s & Réinitialisation Manuelle** : Pour éviter tout blocage indéfini du bouton "Exécuter", l'exécution est garantie par un bloc `try/catch/finally` qui réinitialise toujours le statut. De plus, un temporisateur Watchdog de 60 secondes force le retour à l'état `idle` avec le log `"Watchdog : statut réinitialisé"` si un traitement dépasse ce délai. Un bouton "Réinitialiser" dans le panneau Ghost Hands permet également de débloquer le statut manuellement.

### 3.5ter Boucle agent fermée (ReAct)
- **Architecture de boucle ReAct (Max 8 tours)** : Pour tous les ordres qui ne correspondent pas à une recette prédéfinie (`SITE_RECIPES`), Ghost Hands bascule en boucle fermée autonome : `Observer (get_interactive_elements + read_all_text) -> Réfléchir (LLM ReAct) -> Agir (action indexée / navigation) -> Vérifier`.
- **Éléments interactifs indexés (`get_interactive_elements`)** : Extrait automatiquement jusqu'à 80 éléments interactifs visibles (`a`, `button`, `input`, `textarea`, `select`, `[role=button]`, `[onclick]`) avec leur index, tag, type, libellé (max 60 caractères) et visibilité.
- **Actions indexées et attentes réactives** :
  - `click_index` : Clique sur un élément via son index en mémoire.
  - `type_index` : Saisit du texte dans un élément via son index (avec protection renforcée des mots de passe).
  - `wait_for_text` & `wait_for_selector` : Attente passive non-bloquante d'éléments textuels ou sélecteurs CSS (sondage toutes les 300ms, timeout 8000ms, retour `{ found: true/false }` sans levée d'erreur).
  - `screenshot` : Capture visuelle de l'onglet actif (format JPEG, qualité 70) déclenchée en secours multimodal.
  - `fill_form` : Remplissage séquentiel optimisé de formulaires multi-champs avec détection passive des sélecteurs, scrollIntoView, focus, déclenchement des événements natifs input/change, animation cyan (600ms) et protection des mots de passe.
  - `submit_form` : Soumission intelligente de formulaire avec détection de bouton type submit/visuel ou déclenchement de l'événement submit sur le formulaire parent, suivi d'une attente de chargement post-soumission.
- **Don Mimétisme — Formulaires Complexes (v2.0 Natif)** :
  - **Groupement automatique** : Quand un formulaire multi-champs est identifié, le LLM groupe tous les champs dans une seule action `fill_form` au lieu de multiplier les `type_index`.
  - **Protection Privacy-First** : Les valeurs saisies ne sont jamais loguées intégralement dans le journal d'observation (uniquement le sélecteur/index et la longueur du texte). Les champs `input[type=password]` restent protégés et lèvent `"Password fields are protected"`.
  - **Confirmation avant soumission sensible** : Avant toute action `submit_form`, Sarra annonce oralement la synthèse des champs remplis et marque une pause réactive de 1,5 seconde durant laquelle l'utilisateur peut dire "stop" ou "annule" pour interrompre l'action.
  - **Refus automatique des formulaires de paiement** : Si le formulaire contient un champ de paiement (`card`, `cvv`, `cc-`, bouton "payer/pay/checkout"), Sarra refuse la soumission automatique avec la narration *"Je ne soumets jamais de formulaire de paiement sans ta validation explicite"* et exige une validation manuelle.
  - **Assimilation au Génome** : Dès le premier `fill_form` réussi, le don "Mimétisme" passe au statut `observed`, puis directement à `assimilated` ("v2.0 natif") à la première soumission réussie avec la mention `"Don Mimétisme assimilé nativement"`.
- **Secours multimodal par Vision (v1.9 Natif)** :
  - Après deux échecs DOM consécutifs (sélecteur introuvable ou erreur de format), la boucle déclenche automatiquement la capture d'écran visuelle via `screenshot` (extension `captureVisibleTab` ou canvas WebFrame).
  - Si le provider actif supporte la vision (Gemini, OpenAI, Qwen), la capture est transmise au LLM avec l'objectif et les éléments indexés.
  - Le LLM répond avec une action fondée visuellement pour débloquer la navigation.
  - **Protection Privacy-First** : La capture visuelle n'est jamais stockée après l'appel, n'est jamais persistée, et chaque envoi produit un log de transparence `"Capture envoyée au provider X pour analyse"`.
  - Lors du premier appel réussi, le don "Vision" du Génome passe automatiquement au statut `observed`, puis à `assimilated` ("v1.9 natif") dès la résolution multimodale réussie.
- **Nettoyage automatique de bannières cookies** : Avant le premier tour de boucle, un nettoyage silencieux tente de cliquer sur les bannières de consentement courantes (`optional_click_by_text` : "tout accepter", "accept all", "accepter tout", etc.).
- **Synthèse vocale & Résumés oraux (VOLET 4)** : Pour les ordres de consultation ("rapporte", "résume", "dis-moi", "explique", "lis-moi"), la réponse finale est automatiquement condensée en 3 phrases par le LLM pour une restitution orale fluide par Sarra.
- **Tolérance aux erreurs & Auto-correction** : Chaque erreur est consignée dans la trace d'observation du tour suivant, permettant au LLM de corriger son action. Deux erreurs consécutives déclenchent le secours multimodal Vision avant d'abandonner en cas de nouvel échec.
- **Mode Offline & Sécurité** : En mode hors-ligne ou en cas de panne LLM, la boucle bascule automatiquement sur le plan local automatisé avec journalisation explicite.

### 3.5quinquies Module Caméléon — assimilation multi-moteurs
> **Principe fondamental :** *"Le Caméléon assimile des capacités, jamais une identité."*

- **ADN invariant et phénotype adaptatif** : Le module Caméléon n'a AUCUN accès en écriture au system prompt de Sarra, à ses presets de personnalité, à ses principes de protection (passwords, actions sensibles, cadre bleuté) ni au thème visuel. La classe `ChameleonSecurityGuard` filtre toute tentative d'injection et bloque toute altération de l'identité de Sarra.
- **Adaptateurs Multi-Moteurs (`agentEngine.ts`)** : Le système gère une liste d'adaptateurs externes (`mock-adapter`, `browser-use`, `stagehand`, `jarvis`). Aucun adaptateur n'est actif par défaut. Un adaptateur inactif ou sans endpoint est inerte et ne génère aucun appel réseau. L'adaptateur simulé `mockAdapter` fournit des traces de démonstration locales sans dépendance externe.
- **Génome & Registre des Capacités (`capabilityRegistry.ts`)** : Registre persistant en IndexedDB / localStorage à double étiquetage poétique ("don") et technique ("capacité"), avec statut (`absent`, `observed`, `imitated`, `assimilated`).
- **Observation Comparative Sequentielle (`compareHarness.ts`)** : `runComparison` évalue Sarra puis chaque moteur connecté en séquence stricte. La narration vocale est brièvement coupée durant la comparaison, puis restaurée.
- **Trois Canaux d'Assimilation** :
  1. *Canal 1 (Imitation automatique)* : Démonstration réutilisée avec succès 3 fois ➔ passage au statut `imitated`.
  2. *Canal 2 (Extraction assistée & Validation humaine)* : `lessonEngine` produit une explication humaine et un `fixPrompt` pour l'IDE. Le clic sur *"Marquer comme porté au code"* confirme l'assimilation définitive par validation humaine.
  3. *Canal 3 (Découverte de dons inconnus)* : Toute action inconnue dans une trace externe (ex: `screenshot`, `switch_tab`) crée automatiquement une nouvelle capacité `observed` avec plan de portage généré.
- **Zone de Diplomation** : Lorsque la parité est atteinte et que toutes les capacités d'un moteur sont assimilées, la zone diplomatique propose le débrayage propre du moteur via le bouton *"Déconnecter"* sans supprimer les démonstrations acquises.

### 3.6 Persistence IndexedDB & LocalStorage
- Memory facts et historique de conversation stockés dans IndexedDB (ghostDB).
- Préférences utilisateur et configuration persistées dans LocalStorage via Zustand persist.

---

## 4. Gestion de l'État Zustand

### 4.1 Tableau des Champs Persistés

Champ | Type | Valeur par défaut | Persistance
settings | AppSettings | objet par défaut | localStorage
ghostHandsEnabled | boolean | false | localStorage
ghostHandsExtensionId | string | "" | localStorage
ghostHandsNarration | boolean | true | localStorage
voiceSpeed | number | 0.9 | localStorage
voicePitch | number | 0.8 | localStorage
diagnosticEnabled | boolean | false | localStorage
recognitionState | 'off' | 'wake' | 'command' | 'dictation' | 'off' | temps réel (non persisté)
activeConfigTab | 'brain' | 'voice' | 'avatar' | 'personality' | 'ghostHands' | 'interface' | 'brain' | localStorage
selectedFreeLlmProvider | string | null | null | localStorage
selectedFreeTtsProvider | string | null | null | localStorage

### 4.2 Actions Clés du Store
- updateSettings(newSettings) : Mise à jour partielle des réglages.
- setRecognitionState(state) : Mise à jour de l'état d'écoute temps réel (`off`, `wake`, `command`, `dictation`).
- openSettings(tab) : Ouverture du panneau de configuration sur l'onglet spécifié.
- closeSettings() : Fermeture du panneau de configuration.
- setCredentialErrorNotice(notice) : Enregistrement de l'état d'erreur de clé ou quota.
- setOfflineMode(enabled) : Bascule manuelle ou automatique du mode offline.
- addMessage(msg) : Inscription d'un nouveau message au fil de discussion.

---

## 5. Accessibilité Audio
- Sous-titrage système des réponses vocales de l'avatar dans la fenêtre de chat.
- Feedback visuel de l'intensité sonore via le VU-Mètre et les indicateurs d'état (Thinking / Speaking / Idle / Listening).
- Raccourcis clavier (Ctrl+Shift+K pour les paramètres, Ctrl+Shift+D pour le diagnostic).
- Modal interactif de dépannage microphone accessible en 1 clic.

---

## 6. Sécurité et Confidentialité
- Stockage local exclusif des clés API utilisateur dans le LocalStorage du navigateur.
- Transit sécurisé des clés API directement du client vers les endpoints des fournisseurs sans stockage intermédiaire par le serveur Express proxy.
- Aucune donnée personnelle ou historique de conversation n'est transmise à un serveur tiers autre que le fournisseur d'IA sélectionné.

---

## 7. Contraintes de Déploiement
- Environnement Node.js 18+ requis pour l'exécution du serveur Express proxy.
- Application conçue pour fonctionner derrière un reverse-proxy HTTPS (nécessaire pour l'accès aux microphones et APIs vocales du navigateur).
- Compatibilité Navigateurs : Chrome, Edge, Brave, Opera, Firefox (WebSpeech pour la voix système, WebGL pour le VRM 3D).

---

## 8. Comportements UX Détaillés
- Banner de diagnostic microphone au démarrage guidant l'utilisateur en cas de blocage micro.
- Notification visuelle claire en cas d'interruption du service Cloud.
- Transitions fluides entre les modes d'affichage (Immersive, Split, Overlay) gérées par Motion.
- Indication explicite de la source de réponse (IA Cloud vs Présence Locale).

---

## 9. Limitations connues (v2.1)
- WebFrame : Certains sites web avec authentification stricte par jetons liés aux sous-domaines peuvent bloquer les requêtes proxifiées.
- ElevenLabs : Les réglages de vitesse (speed) et de hauteur (pitch) ne sont pas applicables directement en temps réel sur l'AudioContext et sont désactivés pour ce moteur.
- Google OAuth : La connexion aux comptes Google ne peut être effectuée dans une iframe intégrée et nécessite l'ouverture d'un nouvel onglet.
- Firefox : L'API `SpeechRecognition` continue n'est pas activée par défaut sous Firefox ; les contrôles vocaux automatiques y sont grisés avec la mention "Non supporté".
- Mémoire Sarra : Plafond maximal fixé à 200 souvenirs en base IndexedDB. L'extraction automatique de faits par LLM est désactivée en mode hors-ligne.
- Module Caméléon : La qualité de l'assimilation dépend de la qualité des traces externes ; un moteur ne peut enseigner que les capacités que son adaptateur expose.
- Capture d'écran (Don Vision) : Les captures d'écran ne sont envoyées au provider vision (Gemini, OpenAI, Qwen) qu'en dernier secours après 2 échecs consécutifs DOM et ne sont jamais conservées ni persistées.
- Mimétisme (Formulaires) : Refus automatique systématique de toute soumission de formulaire contenant un champ de paiement (`card`, `cvv`, etc.) sans confirmation manuelle explicite. Les mots de passe ne sont jamais saisis par l'agent.
- Ubiquité (Multi-fenêtres/onglets v2.1) : Le nombre simultané de fenêtres contrôlées est plafonné à 5 maximum par ordre afin d'éviter la surcharge mémoire du navigateur. Les URLs d'exploration ne sont jamais affichées en clair avec leurs paramètres de requêtes dans les journaux publics, et toutes les fenêtres contrôlées secondaires sont automatiquement fermées à la fin de la mission (sauf si l'option de conservation est activée).

---

## 10. Évolutions envisageables (hors périmètre v2.0)
- Fine-tuning local autonome sur les traces assimilées par le Caméléon.
- Support de la génération d'images à la volée par l'avatar.
- Détection de mot de réveil (Wake Word) 100% locale via moteur léger WASM/ONNX.
- Mémorisation vectorielle à long terme (RAG local) basée sur IndexedDB & embeddings locaux.
- Intégration native de modèles TTS/STT locaux (WASM / WebGPU / Whisper) pour une autonomie vocale totale sans cloud.
