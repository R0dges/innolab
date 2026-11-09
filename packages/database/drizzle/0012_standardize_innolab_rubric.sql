-- Standardize the visible six-criterion Innovation Lab rubric for every event.
-- Existing keys remain unchanged at their position so historical score JSON
-- keeps referring to the same row. Missing positions are added without
-- fabricating marks, and obsolete extra criteria stop contributing to results.
WITH standard(position, key, label, description) AS (
  VALUES
    (0, 'strategic_alignment', 'Alignement stratégique', 'Le projet répond clairement à une problématique identifiée dans l’audit et s’inscrit dans les enjeux de l’organisation.'),
    (1, 'relevance_coherence', 'Pertinence & cohérence', 'La solution répond de manière pertinente au problème identifié. L’ensemble du raisonnement est logique et cohérent.'),
    (2, 'feasibility', 'Faisabilité', 'Le projet est réaliste et peut être mis en œuvre avec les moyens définis par l’équipe.'),
    (3, 'solution_clarity', 'Solution claire', 'Le jury comprend concrètement ce qui est proposé et à quoi ressemble la solution.'),
    (4, 'identity', 'Identité', 'Le support et la manière de présenter respectent l’identité attendue de l’organisation.'),
    (5, 'oral_presentation', 'Restitution orale', 'Le pitch est clair, rythmé, maîtrisé et mémorable.')
)
UPDATE "rubric_criterion" AS criterion
SET
  "label" = standard.label,
  "description" = standard.description,
  "weight" = 1
FROM standard
WHERE criterion."position" = standard.position;
--> statement-breakpoint
WITH standard(position, key, label, description) AS (
  VALUES
    (0, 'strategic_alignment', 'Alignement stratégique', 'Le projet répond clairement à une problématique identifiée dans l’audit et s’inscrit dans les enjeux de l’organisation.'),
    (1, 'relevance_coherence', 'Pertinence & cohérence', 'La solution répond de manière pertinente au problème identifié. L’ensemble du raisonnement est logique et cohérent.'),
    (2, 'feasibility', 'Faisabilité', 'Le projet est réaliste et peut être mis en œuvre avec les moyens définis par l’équipe.'),
    (3, 'solution_clarity', 'Solution claire', 'Le jury comprend concrètement ce qui est proposé et à quoi ressemble la solution.'),
    (4, 'identity', 'Identité', 'Le support et la manière de présenter respectent l’identité attendue de l’organisation.'),
    (5, 'oral_presentation', 'Restitution orale', 'Le pitch est clair, rythmé, maîtrisé et mémorable.')
)
INSERT INTO "rubric_criterion" (
  "id",
  "event_id",
  "key",
  "label",
  "description",
  "weight",
  "position"
)
SELECT
  'rbc_' || substring(md5(event."id" || ':innolab:' || standard.position::text), 1, 20),
  event."id",
  'innolab_' || standard.key,
  standard.label,
  standard.description,
  1,
  standard.position
FROM "event" AS event
CROSS JOIN standard
WHERE NOT EXISTS (
  SELECT 1
  FROM "rubric_criterion" AS existing
  WHERE existing."event_id" = event."id"
    AND existing."position" = standard.position
);
--> statement-breakpoint
DELETE FROM "rubric_criterion"
WHERE "position" NOT BETWEEN 0 AND 5;
