export interface DefaultRubricCriterion {
  key: string;
  label: string;
  description: string;
  weight: number;
}

/** Default project-evaluation grid for every new Innovation Lab event. */
export const DEFAULT_RUBRIC = [
  {
    key: "strategic_alignment",
    label: "Alignement stratégique",
    description: "Le projet répond clairement à la problématique et aux enjeux de l’événement.",
    weight: 1,
  },
  {
    key: "relevance_coherence",
    label: "Pertinence et cohérence",
    description: "La solution est pertinente ; le raisonnement est logique et cohérent.",
    weight: 1,
  },
  {
    key: "feasibility",
    label: "Faisabilité",
    description: "Le projet est réaliste et réalisable avec les moyens disponibles.",
    weight: 1,
  },
  {
    key: "solution_clarity",
    label: "Clarté de la solution",
    description: "Le jury comprend concrètement la proposition et son fonctionnement.",
    weight: 1,
  },
  {
    key: "support_quality",
    label: "Qualité du support",
    description:
      "Le support et la présentation renforcent la compréhension et l’identité du projet.",
    weight: 1,
  },
  {
    key: "oral_presentation",
    label: "Restitution orale",
    description: "Le pitch est clair, rythmé, maîtrisé et mémorable.",
    weight: 1,
  },
] as const satisfies readonly DefaultRubricCriterion[];
