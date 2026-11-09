# Pourquoi corriger les différences de sévérité entre coachs

## Décision retenue

Juryza conserve la correction par Z-score avant de calculer le classement final des projets.

## Le problème

Deux coachs peuvent être d’accord sur l’ordre des projets tout en utilisant différemment l’échelle de 1 à 5 :

- un coach sévère donne par exemple 2, 3 et 4 ;
- un coach généreux donne 3, 4 et 5.

Une moyenne directe donnerait davantage d’influence aux notes hautes du coach généreux, alors que les deux coachs expriment le même classement.

## Pourquoi ce choix convient à Innolab

- Tous les coachs évaluent tous les projets.
- Tous utilisent la même grille, définie avant le début des projets.
- Toutes les évaluations ont le même poids.
- La correction compare donc les coachs sur le même ensemble de projets et réduit seulement leur différence de sévérité.

## Ce que la correction ne doit pas faire

- Elle ne donne pas plus de poids à un coach.
- Elle ne remplace pas les notes brutes ni les commentaires.
- Elle ne doit pas être appliquée silencieusement : le calcul doit rester documenté et vérifiable.

## Coach donnant la même note à tous les projets

Une série de notes identiques ne permet pas de départager les projets. Dans ce cas :

- les évaluations et les commentaires du coach sont conservés ;
- ses notes restent neutres et n’influencent pas le classement ;
- Juryza avertit le coach avant la clôture afin qu’il puisse vérifier ou corriger son évaluation.

Décision détaillée : [ADR-0007](../decisions/ADR-0007.md). Date de validation : 2026-10-26.
