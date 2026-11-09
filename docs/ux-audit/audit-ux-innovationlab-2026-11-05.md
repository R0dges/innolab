# Audit UX opérationnel — InnovationLab

Date de l’audit : 5 novembre 2026  
Environnement : instance locale de test, `http://localhost:3000`  
Événement créé pour l’audit : `Audit UX InnovationLab 2026`  
Rôles utilisés : participant, coach désigné/juré, coach organisateur  
Formats vérifiés : desktop 1440 × 1000 et mobile 390 × 844

## A. Synthèse de l’audit

### Conclusion

Les cinq missions peuvent être parcourues de bout en bout, de la création de l’événement à la publication des résultats. Les contrôles de confidentialité et de calendrier observés sont solides : les pitchs restent privés avant leur présentation, l’auto-vote n’est pas proposé, un coach ne vote pas, les résultats restent masqués avant publication et l’éditeur se verrouille après l’échéance.

La plateforme ne peut toutefois pas être considérée comme opérationnellement fiable pour un événement réel avant la correction de la sélection des pitchs. Lors du scénario mesuré, le pitch à **0 vote a été retenu** et le pitch à **1 vote a été rejeté**, alors que l’écran les classait correctement. Cette décision est annoncée comme irréversible.

### Cinq priorités

| Priorité | Problème ou opportunité | Parcours affectés | Bénéfice attendu |
|---|---|---|---|
| 1 | La sélection irréversible retient un pitch moins bien classé | M2, M3 | Restaurer l’intégrité de la décision et éviter la création des mauvais projets |
| 2 | Le coach désigné n’a pas d’espace de délibération consolidé | M5 | Permettre la comparaison et la résolution des ex æquo sans révéler les notes individuelles |
| 3 | Le coach organisateur ne peut pas adapter les six critères | M1, M5 | Aligner la configuration réelle sur les responsabilités déclarées |
| 4 | Les participants ne reçoivent ni moyennes par critère ni commentaires du jury | M5, publication | Rendre l’évaluation utile et actionnable après l’événement |
| 5 | Le catalogue et plusieurs compteurs contredisent le contenu réel | M1 à M5, navigation | Rétablir la confiance dans les vues de synthèse et la découvrabilité des événements |

### Hypothèses et contre-preuves

| Hypothèse | Conclusion |
|---|---|
| H1 — Délibération collective difficile | **Confirmée.** Le coach désigné peut évaluer et voir les pitchs, mais la vue de résultats consolidés lui est refusée. Aucun espace collectif de comparaison n’a été trouvé. |
| H2 — Information dispersée | **Partiellement infirmée.** La vue d’ensemble d’un événement centralise correctement phase, prochaine action, dates, critères, équipe, calendrier et ressources. La contre-preuve est réelle. Le catalogue vide, les compteurs faux et la séparation entre espace public et gestion réduisent cependant ce bénéfice. |
| H3 — Guidage excessif pour les profils tech | **Plutôt infirmée.** Les raccourcis d’évaluation, l’autosauvegarde et les accès directs sont efficaces. Les confirmations observées protègent des actions à risque : sélection irréversible et soumission incomplète. |
| H4 — Prise en main difficile pour les profils profanes | **Partiellement confirmée.** La phase courante et la prochaine action sont visibles, mais la langue mélangée, les états périmés après action et les rôles ambigus imposent une interprétation inutile. |
| H5 — Incohérences entre phases | **Confirmée sur la sélection et les retours d’état.** Les fenêtres temporelles et la confidentialité fonctionnent, mais la décision de sélection contredit le classement et certains écrans restent sur l’état précédent après succès. |

### Limites

- Les personas sont des profils comportementaux simulés. Aucun sentiment, taux de réussite réel ou fréquence d’incident utilisateur n’a été mesuré.
- Un seul événement InnovationLab complet a été créé, avec 2 participants, 2 pitchs, 1 projet, 1 coach désigné et 1 évaluation.
- Le rôle administrateur n’a pas été testé. Ses droits sont seulement mentionnés par l’interface et le code inspecté.
- Les envois externes, invitations vers de vraies adresses, abonnements Outlook réels, téléchargements de fichiers et scénarios multi-jurés n’ont pas été exécutés.
- Le mobile a été vérifié visuellement et par navigation sur quatre écrans, sans test sur appareil physique ni technologie d’assistance.
- L’audit d’accessibilité est élémentaire ; il ne constitue pas une déclaration de conformité à un standard.

## B. Couverture des tests

### Missions

| Mission | Couverture réelle | Résultat |
|---|---|---|
| M1 — Préparer un événement | Création guidée en 5 étapes, publication, dates, audit/ressources, calendrier, coachs et grille de 6 critères consultés | **Friction.** Création réussie ; critères en lecture seule pour l’organisateur ; calendrier et ressources non alimentés |
| M2 — Proposer et sélectionner | 2 inscriptions, 2 brouillons, modification, soumission, ouverture de présentation, vote, retrait, nouveau vote, clôture et sélection | **Échec critique.** Le pitch à 0 vote est retenu devant celui à 1 vote |
| M3 — Constituer une équipe | Création automatique du projet et de l’équipe, responsable issu du pitch, demande d’adhésion et acceptation | **Réussi avec friction.** La demande acceptée reste affichée comme en attente jusqu’au rechargement |
| M4 — Réaliser un projet | Édition, autosauvegarde, confirmation, soumission, composition d’équipe et verrouillage après échéance | **Réussi avec friction.** La checklist de soumission utilise ponctuellement un état périmé ; ressources/livrables externes non testés |
| M5 — Évaluer, délibérer et publier | Affectation, 6 notes, commentaire, coup de cœur, sauvegarde, prévisualisation privée, clôture et publication | **Partiel.** Évaluation et publication réussies ; délibération du coach désigné indisponible ; feedback final incomplet |

### Rôles, personas et phases

| Dimension | Testé | Non vérifié |
|---|---|---|
| Participant tech | Accès direct, raccourcis, édition, vote, retrait et reprise | Travail simultané et conflits d’édition |
| Participant profane | Parcours guidé par la phase, CTA principal, demandes d’adhésion, confirmations | Observation d’un utilisateur réel sans assistance |
| Coach tech | Évaluation rapide, navigation directe, consultation des pitchs, invitations | Délibération à plusieurs et ex æquo réel |
| Coach profane | File d’évaluation, critères 1–5, progression et sauvegarde | Compréhension réelle des notions de normalisation et de coup de cœur |
| Coach organisateur | Création, configuration, coachs, affectation, résultats et publication | Suppression/restauration, modification d’une activité, export réellement ouvert |
| Phases | Pitch, vote, sélection, formation, projet, évaluation, publication | Annulation/restauration de calendrier, plusieurs projets et plusieurs jurés |

### Mesures observées

- 5 étapes pour créer l’événement.
- 2 participants, 2 pitchs soumis, 1 vote actif et 1 projet demandé à la sélection.
- 1 demande d’adhésion acceptée ; équipe passée de 1/6 à 2/6 membres.
- 1 projet autosauvegardé, soumis puis verrouillé après l’échéance.
- 6 critères renseignés, 1 commentaire, 1 coup de cœur et 1 évaluation sauvegardée.
- 1 affectation créée pour une cible de 3 revues ; l’interface a correctement signalé la sous-couverture.

## C. Registre priorisé des incohérences

### UX-001 — La sélection retient le pitch à 0 vote

| Champ | Contenu |
|---|---|
| Parcours | M2 — clôture de l’évaluation des pitchs et sélection |
| Persona | Coach organisateur ; conséquences pour tous les participants |
| Constat | **Observé :** « Journal des décisions » affiche 1 vote et le statut « Non retenu » ; « Boussole de progression » affiche 0 vote et « Retenu ». **Déclaré :** les pitchs les mieux classés doivent devenir projets. |
| Preuve | [Capture de la sélection](evidence/selection-outcome-participant.png). Reproduction : créer deux pitchs, voter pour l’un, clôturer, demander un projet, confirmer « Créer les projets ». |
| Impact | Décision métier erronée et irréversible ; mauvais projet, équipe et responsable créés. La confiance dans les votes et la traçabilité est directement compromise. |
| Gravité | **Critique** |
| Cause | **Inférée après inspection :** le sous-select corrélé qui compte les votes dans `pitch-selection/route.ts` est susceptible d’attribuer le même total aux candidats, puis le tirage de départage décide. L’écran de pitchs utilise un autre comptage et affiche bien 1 puis 0. |
| Recommandation | Calculer les totaux par `pitchId` dans une agrégation explicite, les joindre aux candidats, et refuser la finalisation si l’ordre serveur diffère du classement prévisualisé. |
| Implémentation | Retourner dans la prévisualisation la shortlist ordonnée `{pitchId, votes, rang}` produite par la même fonction que la transaction. Afficher cette shortlist dans la confirmation. Journaliser les totaux utilisés. |
| Effort | Moyen, incertitude faible |
| Validation | Test d’intégration avec deux pitchs à 1 et 0 vote : le pitch à 1 vote est toujours sélectionné. Tests additionnels 2–1–0, égalité à la dernière place et répétition concurrente. |

### UX-002 — Les six critères sont réservés à l’administrateur

| Champ | Contenu |
|---|---|
| Parcours | M1 — création et configuration ; M5 — grille finale |
| Persona | Coach organisateur |
| Constat | **Observé :** l’étape « Règles » du wizard ne propose aucun réglage. La vérification annonce qu’un administrateur pourra adapter les critères. La page « Critères » affiche six critères, mais tous les champs et « Add criterion » sont désactivés. |
| Preuve | [Grille en lecture seule](evidence/organizer-rubric-readonly.png). |
| Impact | L’organisateur ne peut pas adapter la grille au contexte de l’événement, alors qu’il en porte la responsabilité déclarée. |
| Gravité | **Majeure** |
| Cause | **Confirmée par l’interface, technique probable :** politique d’autorisation admin-only spécifique au workflow Innolab. |
| Recommandation | Autoriser le créateur/organisateur de l’événement à modifier les six critères et leurs poids avant l’ouverture des évaluations. |
| Implémentation | Utiliser la permission de gestion de l’événement pour les mutations de grille. Après la première note, afficher un avertissement d’impact et conserver l’historique ; après clôture, verrouiller. Intégrer la grille au wizard ou fournir un CTA explicite juste après création. |
| Effort | Moyen, incertitude moyenne |
| Validation | Un organisateur non-admin modifie un libellé et un poids avant l’évaluation ; un coach désigné reste en lecture seule ; le total et les résultats se recalculent conformément aux règles. |

### UX-003 — Aucun espace de délibération pour le coach désigné

| Champ | Contenu |
|---|---|
| Parcours | M5 — comparaison, délibération et ex æquo |
| Persona | Coach désigné/juré, tech et profane |
| Constat | **Observé :** le coach désigné voit les pitchs, sa file et ses propres notes. L’URL des résultats de gestion affiche « Vous ne pouvez pas gérer cet événement ». La route pairwise attendue sous l’évaluation retourne 404 sur l’événement de démonstration. |
| Preuve | [Accès refusé aux résultats consolidés](evidence/appointed-coach-results-error.png). |
| Impact | La délibération doit se faire hors plateforme ou par partage d’écran de l’organisateur. Les ex æquo n’ont pas de parcours collectif observable. |
| Gravité | **Majeure** |
| Cause | Séparation actuelle entre notes individuelles privées et résultats réservés au gestionnaire, sans niveau intermédiaire de synthèse anonyme. |
| Recommandation | Ajouter une vue de délibération accessible aux coachs nommés, contenant agrégats anonymisés, écarts par critère, complétude et ex æquo, sans notes nominatives. |
| Implémentation | Créer un droit `canDeliberate` distinct de `canManage`. Réutiliser le calcul consolidé des résultats, supprimer l’identité des jurés et masquer la vue avant la phase de délibération. L’organisateur conserve seul publication et décisions irréversibles. |
| Effort | Élevé, incertitude moyenne |
| Validation | Deux coachs nommés comparent les mêmes agrégats après clôture des notes ; aucun ne peut lire la note individuelle de l’autre ni publier les résultats. Un ex æquo est signalé sans départage automatique. |

### UX-004 — Le feedback publié est incomplet

| Champ | Contenu |
|---|---|
| Parcours | M5 — publication et retour au participant |
| Persona | Participants, en particulier le responsable de projet |
| Constat | **Observé :** après publication, le classement montre rang et score global. La fiche projet montre le score normalisé et le nombre de revues, mais ni moyenne par critère ni commentaire du jury. Le commentaire saisi pendant le test est absent. |
| Preuve | [Classement publié](evidence/published-results-participant.png) et [fiche projet sans feedback du jury](evidence/project-feedback-participant.png). |
| Impact | Le participant apprend son rang, mais pas pourquoi il l’a obtenu ni quoi améliorer. L’utilité pédagogique de l’évaluation est perdue. |
| Gravité | **Majeure** |
| Cause | **Partiellement confirmée par inspection :** le moteur calcule déjà les moyennes par critère, mais l’UI publique ne les rend pas. Les commentaires de score ne sont pas inclus dans la réponse de résultats. |
| Recommandation | Afficher aux membres du projet les six moyennes et les commentaires anonymisés après publication. |
| Implémentation | Réutiliser `project.criteria` pour la répartition. Ajouter un endpoint authentifié « feedback de mon projet » qui agrège les commentaires non vides sans `judgeId`. Ne jamais exposer le feedback d’une autre équipe si la règle ne l’autorise pas. |
| Effort | Moyen, incertitude faible |
| Validation | Après publication, un membre voit 6 moyennes et le commentaire anonyme de son projet ; un non-membre ne peut pas récupérer ces commentaires ; aucune identité de juré n’est présente dans le DOM ou la réponse réseau. |

### UX-005 — Catalogue et compteurs contradictoires

| Champ | Contenu |
|---|---|
| Parcours | Navigation globale, tableau de bord et liste organisateur |
| Persona | Tous les profils |
| Constat | **Observé avant création de l’événement d’audit :** `/events` affichait 0 événement, alors que le tableau de bord participant ouvrait « Open Build 2026 ». La liste organisateur indiquait 0 projet pour « Sample Hack 2026 », tandis que sa page « Projets » en listait 41 soumis. |
| Preuve | [Catalogue initial vide](evidence/participant-desktop-events.png) ; [résultats avec 41 projets](evidence/organizer-desktop-manage-sample-hack-2026-results.png). |
| Impact | Un participant conclut qu’aucun événement n’existe ; l’organisateur ne peut pas se fier aux indicateurs de portefeuille. |
| Gravité | **Majeure** |
| Cause | **Confirmée par inspection pour le catalogue :** la liste publique filtre les événements `workflow = innolab`, alors que les données de démonstration visibles ailleurs sont `standard`. Cause du compteur organisateur non confirmée. |
| Recommandation | Aligner les sources de données et expliciter les périmètres : un même événement visible au tableau de bord doit être trouvable dans le catalogue approprié. |
| Implémentation | Migrer ou masquer les fixtures incompatibles ; partager une projection de compteur commune entre `/manage`, `/submissions` et les cartes. Afficher séparément « total », « soumis » et « brouillons » si nécessaire. |
| Effort | Moyen, incertitude moyenne |
| Validation | Pour chaque événement publié, les comptes du catalogue, du tableau de bord, de la liste de gestion et de la page projets concordent avec les mêmes définitions. |

### UX-006 — Plusieurs actions réussies laissent un état périmé

| Champ | Contenu |
|---|---|
| Parcours | M2, M3 et M4 |
| Persona | Participants tech et profanes |
| Constat | **Observé :** après soumission d’un pitch, la carte est restée temporairement « Brouillon » ; après acceptation d’une adhésion, le participant apparaissait dans l’équipe mais sa demande restait aussi dans « Demandes d’inscription » ; la confirmation de projet signalait le slogan manquant après que l’autosauvegarde serveur l’avait accepté. |
| Preuve | Étapes reproductibles consignées dans les scénarios M2–M4 ; réponses API 200 observées avant les états contradictoires. |
| Impact | Doubles clics, répétition d’une décision, doute sur la réussite et risque d’action opposée pour « corriger » un état déjà à jour. |
| Gravité | **Modérée** |
| Cause | Invalidation de requête non attendue, données calculées depuis l’ancien modèle ou mutation optimiste incomplète. |
| Recommandation | Faire du résultat serveur la nouvelle source locale immédiatement après succès et retirer les éléments devenus invalides. |
| Implémentation | Mettre à jour le cache avec la réponse de mutation, puis attendre le refetch avant de réactiver l’action. Calculer la checklist de soumission depuis les champs courants. |
| Effort | Faible à moyen, incertitude faible |
| Validation | Après chaque réponse 2xx, un seul état cohérent est visible sans rechargement : « Proposé », demande retirée de la file, checklist fondée sur les valeurs sauvegardées. |

### UX-007 — La localisation française est incomplète

| Champ | Contenu |
|---|---|
| Parcours | Tous, particulièrement calendrier, gestion, résultats et projet |
| Persona | Profils francophones peu à l’aise avec le numérique |
| Constat | **Observé :** mélange continu de « Ideas open », « Submission deadline », « Results published », « Save », « Draft », « Judges », « No activity scheduled », dates anglaises et pluriels tels que « 0 activitys » ou « 1 participants ». |
| Preuve | [Vue d’événement](evidence/participant-desktop-e-audit-ux-innovationlab-2026.png), [tableau de bord mobile](evidence/participant-mobile-dashboard.png), [résultats organisateur](evidence/organizer-desktop-manage-sample-hack-2026-results.png). |
| Impact | Vocabulaire métier instable, lecture plus lente, difficulté à apprendre les statuts et qualité perçue réduite. |
| Gravité | **Modérée** |
| Cause | Chaînes codées en dur hors dictionnaire et formatage de dates non lié à la locale active. |
| Recommandation | Achever l’internationalisation par parcours, avec glossaire métier unique et règles de pluriel. |
| Implémentation | Extraire toutes les chaînes, y compris statuts API présentés, placeholders, toasts et textes d’erreur. Formater dates/relatifs avec `fr-FR`. Ajouter un test de détection de texte anglais sur les écrans français clés. |
| Effort | Moyen, incertitude faible |
| Validation | Les scénarios M1–M5 en FR ne contiennent plus de libellé anglais hors noms propres, code ou URL ; les pluriels 0/1/n sont corrects. |

### UX-008 — La publication ne demande pas de confirmation finale

| Champ | Contenu |
|---|---|
| Parcours | M5 — publication |
| Persona | Coach organisateur |
| Constat | **Observé :** une fois la clôture passée, « Publish results » publie immédiatement. Une prévisualisation existe et l’action est réversible par « Unpublish », ce qui limite le risque. |
| Preuve | Publication exécutée avec une seule activation après la prévisualisation. |
| Impact | Publication accidentelle possible, avec exposition immédiate du classement et du Wall of Fame. |
| Gravité | **Modérée** |
| Cause | Mutation directe lorsque le vote communautaire n’est pas ouvert ; dialogue seulement prévu lorsqu’il faut aussi fermer ce vote. |
| Recommandation | Demander une confirmation courte rappelant l’audience et les éléments publiés. |
| Implémentation | Dialogue : classement, moyennes, feedbacks, Wall of Fame et possibilité de masquer à nouveau. Ne pas ajouter d’étape avant la prévisualisation. |
| Effort | Faible, incertitude faible |
| Validation | Aucun clic simple ne publie ; la confirmation nomme explicitement l’audience et l’action finale produit un toast « Résultats publiés ». |

### UX-009 — Quelques affordances restent orientées desktop ou rôle système

| Champ | Contenu |
|---|---|
| Parcours | Mobile, navigation publique et édition |
| Persona | Participant profane sur mobile |
| Constat | **Observé :** l’éditeur mobile reste lisible et sans défilement horizontal, mais affiche des raccourcis clavier desktop (`⌘S`, `/`). Le pied de page propose « Se connecter » à un utilisateur déjà connecté et « Créer un événement » à un participant. |
| Preuve | [Éditeur mobile](evidence/participant-mobile-projects-prj-zoa2r3muptu9.png). |
| Impact | Bruit informationnel et attentes erronées, sans blocage direct. |
| Gravité | **Mineure** |
| Cause | Contenu partagé sans adaptation à la capacité de l’appareil ni à l’état de session/permission. |
| Recommandation | Masquer les raccourcis non pertinents sur écran tactile et personnaliser les liens globaux selon session et rôle. |
| Implémentation | Préférer une aide « Les modifications sont enregistrées automatiquement » sur mobile ; ne rendre que les destinations autorisées et utiles. |
| Effort | Faible, incertitude faible |
| Validation | À 390 px, aucun raccourci desktop ni lien contradictoire avec la session n’est affiché ; les actions principales restent visibles. |

## D. Améliorations transversales

### Ce qui fonctionne et doit être conservé

- La vue d’ensemble de l’événement constitue un bon point de centralisation : phase, prochaine action, calendrier, critères, équipe et ressources.
- Les règles de confidentialité observées sont compréhensibles et effectivement appliquées.
- Le vote peut être créé, retiré puis recréé ; l’auto-vote et le vote des coachs ne sont pas proposés.
- Le wizard en cinq étapes donne une progression claire et une vérification finale.
- La confirmation de sélection explique correctement son irréversibilité.
- Le planificateur d’affectations prévisualise sans écrire et signale explicitement la sous-couverture.
- L’évaluation 1–5, les raccourcis et la progression sont efficaces pour un profil tech.
- L’éditeur et le tableau de bord restent exploitables à 390 px ; aucune dérive horizontale majeure n’a été observée.

### Parcours actuel (AS-IS)

```text
Catalogue parfois vide
  → accès direct ou tableau de bord
  → vue d’ensemble bien centralisée
  → pitchs → vote → sélection irréversible
  → projet / équipe dans des espaces séparés
  → évaluation individuelle privée
  → résultats consolidés organisateur uniquement
  → publication globale sans feedback détaillé de l’équipe
```

### Parcours cible (TO-BE)

```text
Catalogue et tableau de bord cohérents
  → vue d’ensemble = phase + prochaine action + échéance + ressources
  → classement de pitchs calculé une seule fois et prévisualisé
  → Promotion irréversible → projet créé
  → états de mutation immédiatement cohérents
  → une note collective par critère et projet, partagée par tous les coachs du lieu
  → coup de cœur individuel ajouté avant la moyenne, sans Z-score
  → publication versionnée
  → classement authentifié + feedback de consensus réservé aux membres du projet
```

Cette évolution adapte le tableau de bord au rôle et à la phase. Elle réorganise les informations déjà calculées et ajoute la vue de délibération collective nécessaire.

### Arbitrages de mitigation validés les 2026-11-06 et 2026-11-09

| Sujet | Décision validée |
|---|---|
| Rôles | Aucun coach responsable. Tous les coachs du lieu sont rattachés automatiquement et disposent des mêmes droits métier. L’admin reste un rôle technique global. |
| Événements | Un seul événement actif par lieu ; les brouillons futurs restent permis. Une seconde activation est refusée en indiquant le créateur du premier événement. |
| Grille | Modifiable par tous les coachs rattachés jusqu’à la Promotion, puis verrouillée et historisée. |
| Évaluation | Évaluation et délibération sont une seule phase : une note collective de 1 à 5 par critère et projet, sans affectation individuelle ni Z-score. |
| Coup de cœur | Un choix par coach et par événement ; chaque point est ajouté avant la moyenne des critères. |
| Feedback | Note globale, détail par critère et commentaire de consensus après publication ; le commentaire est visible uniquement par les membres du projet. |
| Projets | Jamais anonymes. Les participants de l’événement et les coachs rattachés voient nom, description et membres affichés « prénom + initiale ». |
| Groupes | Après mardi 23 h 59, tout changement concernant une personne déjà affectée passe par n’importe quel coach, avec motif et audit. Une personne sans projet peut encore demander à rejoindre un groupe. |
| Archives | Résultats historiques visibles par défaut à tous les comptes actifs ; l’admin peut appliquer rétroactivement une politique globale plus restrictive. |
| Publication | Snapshot immuable à chaque publication. L’admin seul rouvre ; les coachs revalident puis publient une nouvelle version. |

La décision canonique et ses conséquences techniques sont consignées dans [ADR-0011](../architecture/adr/decisions/ADR-0011.md).

### Principes d’implémentation transversaux

1. Une décision affichée et une décision enregistrée doivent utiliser le même calcul serveur.
2. Une mutation réussie remplace immédiatement l’état local ; aucun élément ne peut être simultanément accepté et en attente.
3. Les permissions doivent distinguer gestion, délibération, évaluation et publication.
4. Les agrégats peuvent être partagés sans lever l’anonymat des notes individuelles.
5. Le français actif doit couvrir statuts, dates, erreurs, toasts et contenus vides.
6. Les vues de synthèse doivent partager les mêmes définitions de compteur.

### Risques de régression à couvrir

- Vote : auto-vote, remplacement, retrait, égalité et clôture concurrente.
- Sélection : agrégation exacte, idempotence, transaction concurrente et irréversibilité.
- Permissions : coach désigné, organisateur, administrateur, participant membre et non-membre.
- Confidentialité : aucune note individuelle avant/après publication ; commentaires anonymisés limités à l’équipe concernée.
- Échéances : verrouillage serveur de l’édition, de la soumission et des notes.
- Résultats : mêmes nombres dans prévisualisation, export, classement et Wall of Fame.

## E. Plan d’amélioration priorisé

### Corrections prioritaires

| Ordre | Action | Impact | Effort |
|---|---|---|---|
| P0 | Corriger l’agrégation de votes et bloquer la sélection tant que les tests d’intégrité échouent | Critique | Moyen |
| P0 | Ajouter des tests bout en bout sur 2–1–0 votes, égalité et concurrence | Critique | Moyen |
| P1 | Exposer les moyennes et commentaires anonymisés à l’équipe après publication | Majeur | Moyen |
| P1 | Ouvrir la configuration des six critères au coach organisateur avant évaluation | Majeur | Moyen |
| P1 | Fournir une vue de délibération anonyme aux coachs désignés | Majeur | Élevé |
| P1 | Réconcilier catalogue et compteurs | Majeur | Moyen |

### Améliorations fonctionnelles et ergonomiques

| Ordre | Action | Impact | Effort |
|---|---|---|---|
| P1 | Synchroniser immédiatement l’UI après pitch, adhésion et autosauvegarde | Modéré | Faible à moyen |
| P1 | Terminer la traduction française et le formatage local des dates/pluriels | Modéré | Moyen |
| P2 | Confirmer la publication et rappeler son audience | Modéré | Faible |
| P2 | Adapter aide et navigation au mobile, à la session et au rôle | Mineur | Faible |

### Hypothèses à tester avec de vrais utilisateurs

- Un coach profane identifie-t-il sans aide la différence entre évaluation individuelle et délibération collective ?
- Un participant comprend-il la distinction entre pitch retenu, équipe créée et projet à soumettre ?
- Les termes « score normalisé », « coup de cœur » et « sous-couvert » sont-ils compris sans explication orale ?
- Après une interruption, la vue d’ensemble suffit-elle à retrouver la prochaine action ?
- Sur mobile, l’éditeur et la chronologie restent-ils confortables avec le clavier virtuel et un lecteur d’écran ?

Les critères d’étude doivent rester comportementaux : tâche accomplie ou non, détours observés, erreurs, demandes d’aide et capacité à expliquer la conséquence de l’action. La fréquence réelle des problèmes relevés ici est inconnue.
