# Juryza — registre des décisions d’architecture

Ce dossier constitue la **phase 1 de l’audit rétrospectif**. Il décrit les choix réellement visibles dans le code et l’historique Git. Il ne les approuve pas automatiquement.

## Référence de l’audit

- Dépôt : `R0dges/innolab`
- Branche publiée examinée : `develop`
- Baseline poussée et vérifiée : [`2c0b7f82`](https://github.com/R0dges/innolab/tree/2c0b7f82eca193a89e4c0d2ed0982a02b8fb7f59)
- Première révision du dépôt : [`e8b34068`](https://github.com/R0dges/innolab/commit/e8b340680fc28114d6699d9a68e72e11c2a2e02c)
- Date de vérification : 2026-10-26
- État documentaire : vérifié techniquement et arbitré par le responsable produit Innolab

Des changements locaux indexés mais non commités ont aussi été lus. Ils sont toujours désignés comme **évolution locale observée** et ne sont jamais présentés comme une décision publiée.

## En clair

Les dix choix rétrospectifs existent dans Juryza. ADR-0011 consigne en plus les arbitrages produit issus de la révision UX de novembre 2026 :

- `e8b34068` est le scaffold create-notils, pas encore le portail fonctionnel ;
- `f14bec2b` introduit l’essentiel du premier noyau Juryza : base, API, permissions, notation et Docker ;
- `82b1a7be` est une refonte majeure, malgré son message de commit anodin ;
- `86c5a13b` centralise ensuite la base et les migrations ;
- `3c98f360` et `2c0b7f82` ajoutent le parcours des pitches, désormais poussé sur `develop`.

## Décisions arbitrées

| ADR | Décision observée | Décision retenue | Arbitrage humain |
|---|---|---|---|
| [ADR-0001](decisions/ADR-0001.md) | Une application Next.js pour l’UI et l’API | Conserver un déployable unique avec séparation interne claire | Accepté le 2026-10-26 |
| [ADR-0002](decisions/ADR-0002.md) | PostgreSQL 18 et Drizzle | Conserver avec migrations, sauvegardes et restaurations contrôlées | Accepté le 2026-10-26 |
| [ADR-0003](decisions/ADR-0003.md) | Better Auth et autorisations serveur | Conserver l’authentification et séparer explicitement identité et rôles métier | Accepté le 2026-10-26 |
| [ADR-0004](decisions/ADR-0004.md) | API REST comme frontière de confiance | Imposer les contrôles et tests de refus côté serveur | Accepté le 2026-10-26 |
| [ADR-0005](decisions/ADR-0005.md) | Données, droits et participations séparés par événement | Une instance Innovation Lab gère plusieurs événements isolés ; un participant a au plus un pitch et un projet par événement | Accepté le 2026-10-26, complété le 2026-10-27 |
| [ADR-0006](decisions/ADR-0006.md) | Résultats calculés à la demande | Figer, versionner et contrôler la visibilité des résultats publiés | Accepté le 2026-10-26 |
| [ADR-0007](decisions/ADR-0007.md) | Normalisation des coachs par Z-score | Conservée hors Innovation Lab ; remplacée par la note collective dans Innovation Lab | Remplacé pour Innovation Lab le 2026-11-09 |
| [ADR-0008](decisions/ADR-0008.md) | Comparaisons Bradley–Terry | Retirer les duels ; grille modifiable par tous les coachs jusqu’à la Promotion | Révisé le 2026-11-09 |
| [ADR-0009](decisions/ADR-0009.md) | Environnement local Docker Compose | Conserver pour le local, les tests et la démonstration | Accepté le 2026-10-26 |
| [ADR-0010](decisions/ADR-0010.md) | Réduction des abstractions Notils | N’extraire que les modules ayant des usages réels | Accepté le 2026-10-26 |
| [ADR-0011](decisions/ADR-0011.md) | Parcours Innovation Lab par lieu | Un événement actif par lieu, coachs égaux, délibération collective, projets privés et publications versionnées | Accepté les 2026-11-06 et 2026-11-09 |

## Qualification des preuves

- **Observé** : présent dans un arbre, un diff ou un test Git.
- **Déclaré** : affirmé par une documentation ou un message de commit.
- **Inféré** : explication plausible, mais non attestée par l’historique.
- **Indéterminé** : aucune preuve suffisante.

`spec.md`, ajouté par `36e9b777`, prouve certaines exigences métier. Aucun prompt ni compte rendu de délibération architecturale n’a été trouvé dans Git. Les messages de commit restent des indices, pas des preuves de fonctionnement.

## Règle d’évolution

Une décision humaine doit renseigner la conclusion, le décideur, la date et le motif dans la fiche concernée. Un remplacement futur doit créer un nouvel ADR ou indiquer explicitement l’ADR remplacé. Aucun choix ne doit être considéré comme accepté sur la seule base de cet audit.
