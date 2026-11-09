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
    description:
      "Le projet répond clairement à une problématique identifiée dans l’audit et s’inscrit dans les enjeux de l’organisation.",
    weight: 1,
  },
  {
    key: "relevance_coherence",
    label: "Pertinence & cohérence",
    description:
      "La solution répond de manière pertinente au problème identifié. L’ensemble du raisonnement est logique et cohérent.",
    weight: 1,
  },
  {
    key: "feasibility",
    label: "Faisabilité",
    description:
      "Le projet est réaliste et peut être mis en œuvre avec les moyens définis par l’équipe.",
    weight: 1,
  },
  {
    key: "solution_clarity",
    label: "Solution claire",
    description:
      "Le jury comprend concrètement ce qui est proposé et à quoi ressemble la solution.",
    weight: 1,
  },
  {
    key: "identity",
    label: "Identité",
    description:
      "Le support et la manière de présenter respectent l’identité attendue de l’organisation.",
    weight: 1,
  },
  {
    key: "oral_presentation",
    label: "Restitution orale",
    description: "Le pitch est clair, rythmé, maîtrisé et mémorable.",
    weight: 1,
  },
] as const satisfies readonly DefaultRubricCriterion[];
