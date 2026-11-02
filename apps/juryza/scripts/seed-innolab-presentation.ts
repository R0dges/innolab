import { asc, like } from "drizzle-orm";

import {
  announcement,
  assignment,
  db,
  event,
  eventJudge,
  pitch,
  pitchVote,
  pool,
  prize,
  project,
  registration,
  rubricCriterion,
  score,
  team,
  teamMember,
  track,
  user,
} from "@/lib/db";
import { id } from "@/lib/ids";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const at = (days: number) => new Date(now + days * DAY);

const doc = (...paragraphs: string[]) => ({
  type: "doc" as const,
  content: paragraphs.map((text) => ({
    type: "paragraph",
    content: [{ type: "text", text }],
  })),
});

const ideas = [
  {
    title: "Pass Mobilité",
    description:
      "Une application qui réunit les transports publics, le vélo partagé et le covoiturage dans un itinéraire unique, simple et accessible.",
    project: "Mobilité 360",
    team: "Les Navigateurs",
    tagline: "Tous les déplacements locaux dans une seule expérience.",
    tags: ["Mobilité", "React", "Open data"],
  },
  {
    title: "Énergie Claire",
    description:
      "Un tableau de bord qui rend la consommation énergétique des bâtiments compréhensible et propose des actions concrètes aux équipes.",
    project: "Énergie Claire",
    team: "Watt Wise",
    tagline: "Comprendre aujourd’hui pour économiser demain.",
    tags: ["Énergie", "Data", "UX"],
  },
  {
    title: "Compétences en partage",
    description:
      "Une place de marché interne pour offrir trente minutes de mentorat, demander une expertise et faire circuler les savoirs.",
    project: "SkillLink",
    team: "Les Passeurs",
    tagline: "La bonne compétence, au bon moment, dans la bonne équipe.",
    tags: ["RH", "Matching", "Communauté"],
  },
  {
    title: "Zéro gaspillage cantine",
    description:
      "Une prévision quotidienne des repas et un système de réservation qui réduisent les surplus sans diminuer le choix.",
    project: "Juste Portion",
    team: "Impact Cuisine",
    tagline: "Moins de déchets, autant de plaisir.",
    tags: ["Foodtech", "Prévision", "Impact"],
  },
  {
    title: "Accueil sans friction",
    description:
      "Un assistant de préparation qui donne aux nouveaux collègues un parcours personnalisé avant leur premier jour.",
    project: "Bienvenue+",
    team: "First Day",
    tagline: "Un premier jour qui commence avant le premier jour.",
    tags: ["Onboarding", "Automatisation", "RH"],
  },
  {
    title: "Réunions utiles",
    description:
      "Un rituel léger qui vérifie l’objectif, les décisions attendues et les personnes réellement nécessaires avant chaque réunion.",
    project: "Focus Meeting",
    team: "Temps Fort",
    tagline: "Moins de réunions, davantage de décisions.",
    tags: ["Productivité", "Collaboration", "SaaS"],
  },
] as const;

type DemoStage = {
  slug: string;
  name: string;
  tagline: string;
  hue: number;
  pitchOpen: number;
  pitchClose: number;
  pitchVoteOpen: number;
  pitchVoteClose: number;
  projectOpen: number;
  projectClose: number;
  judgingClose: number;
  pitchStatuses: Array<"draft" | "submitted" | "selected" | "rejected">;
  projects: "none" | "draft" | "submitted";
  judging: "none" | "partial" | "complete";
  resultsPublished: boolean;
  announcement: string;
};

const stages: DemoStage[] = [
  {
    slug: "demo-innolab-01-pitchs",
    name: "DEMO Innolab 1/6 · Dépôt des pitchs",
    tagline: "Les participants proposent une idée, l’enregistrent en brouillon puis la soumettent.",
    hue: 215,
    pitchOpen: -30,
    pitchClose: 120,
    pitchVoteOpen: 121,
    pitchVoteClose: 150,
    projectOpen: 151,
    projectClose: 240,
    judgingClose: 260,
    pitchStatuses: ["draft", "submitted", "submitted", "submitted", "submitted", "submitted"],
    projects: "none",
    judging: "none",
    resultsPublished: false,
    announcement: "Le dépôt des idées est ouvert. Préparez un pitch clair en une minute.",
  },
  {
    slug: "demo-innolab-02-votes",
    name: "DEMO Innolab 2/6 · Vote des pitchs",
    tagline: "Les participants inscrits choisissent un pitch après le début de la présentation.",
    hue: 260,
    pitchOpen: -120,
    pitchClose: -2,
    pitchVoteOpen: -1,
    pitchVoteClose: 120,
    projectOpen: 121,
    projectClose: 240,
    judgingClose: 260,
    pitchStatuses: Array(6).fill("submitted"),
    projects: "none",
    judging: "none",
    resultsPublished: false,
    announcement:
      "Le vote des idées est ouvert. Chaque participant choisit un pitch et peut modifier son choix.",
  },
  {
    slug: "demo-innolab-03-selection",
    name: "DEMO Innolab 3/6 · Projets retenus",
    tagline: "Les cinq pitchs retenus sont devenus automatiquement des projets avec leur équipe.",
    hue: 292,
    pitchOpen: -150,
    pitchClose: -140,
    pitchVoteOpen: -139,
    pitchVoteClose: -2,
    projectOpen: 120,
    projectClose: 240,
    judgingClose: 260,
    pitchStatuses: ["selected", "selected", "selected", "selected", "selected", "rejected"],
    projects: "draft",
    judging: "none",
    resultsPublished: false,
    announcement:
      "La sélection est publiée. Les auteurs des idées retenues préparent la constitution des équipes.",
  },
  {
    slug: "demo-innolab-04-projets",
    name: "DEMO Innolab 4/6 · Travail sur les projets",
    tagline: "Les équipes développent leur solution et complètent leurs livrables.",
    hue: 170,
    pitchOpen: -160,
    pitchClose: -150,
    pitchVoteOpen: -149,
    pitchVoteClose: -140,
    projectOpen: -2,
    projectClose: 120,
    judgingClose: 140,
    pitchStatuses: ["selected", "selected", "selected", "selected", "selected", "rejected"],
    projects: "draft",
    judging: "none",
    resultsPublished: false,
    announcement:
      "La phase projet est ouverte. Documentez le prototype, la valeur créée et la démonstration.",
  },
  {
    slug: "demo-innolab-05-jury",
    name: "DEMO Innolab 5/6 · Évaluation du jury",
    tagline: "Les coachs devenus jurés évaluent uniquement les projets qui leur sont assignés.",
    hue: 28,
    pitchOpen: -200,
    pitchClose: -190,
    pitchVoteOpen: -189,
    pitchVoteClose: -180,
    projectOpen: -120,
    projectClose: -1,
    judgingClose: 120,
    pitchStatuses: ["selected", "selected", "selected", "selected", "selected", "rejected"],
    projects: "submitted",
    judging: "partial",
    resultsPublished: false,
    announcement:
      "Les livrables sont figés. Le jury désigné par les administrateurs peut maintenant évaluer les projets.",
  },
  {
    slug: "demo-innolab-06-resultats",
    name: "DEMO Innolab 6/6 · Fin de l’Innovation Lab",
    tagline: "Le classement du jury et les projets lauréats sont publiés.",
    hue: 45,
    pitchOpen: -260,
    pitchClose: -250,
    pitchVoteOpen: -249,
    pitchVoteClose: -240,
    projectOpen: -220,
    projectClose: -120,
    judgingClose: -1,
    pitchStatuses: ["selected", "selected", "selected", "selected", "selected", "rejected"],
    projects: "submitted",
    judging: "complete",
    resultsPublished: true,
    announcement: "L’Innovation Lab est terminé. Félicitations aux équipes et merci au jury.",
  },
];

const marksA = [
  { impact: 5, feasibility: 4, presentation: 5 },
  { impact: 4, feasibility: 5, presentation: 4 },
  { impact: 4, feasibility: 4, presentation: 4 },
  { impact: 3, feasibility: 4, presentation: 4 },
  { impact: 3, feasibility: 3, presentation: 4 },
] as const;

const marksB = [
  { impact: 5, feasibility: 4, presentation: 4 },
  { impact: 4, feasibility: 5, presentation: 5 },
  { impact: 4, feasibility: 3, presentation: 4 },
  { impact: 3, feasibility: 4, presentation: 3 },
  { impact: 3, feasibility: 3, presentation: 3 },
] as const;

async function main() {
  const people = await db
    .select({ id: user.id, email: user.email, role: user.role, name: user.name })
    .from(user)
    .orderBy(asc(user.createdAt));

  const byEmail = new Map(people.map((person) => [person.email, person]));
  const admin = byEmail.get("admin@juryza.test");
  const participant = byEmail.get("participant@juryza.test");
  const freeParticipant = byEmail.get("participant.free@juryza.test");
  const judgeA = byEmail.get("judge.a@juryza.test");
  const judgeB = byEmail.get("judge.b@juryza.test");
  if (!admin || !participant || !freeParticipant || !judgeA || !judgeB) {
    throw new Error(
      "Les comptes de démonstration standard sont absents. Exécutez d’abord le seed principal."
    );
  }

  const extraParticipants = people.filter(
    (person) => person.role === "participant" && person.id !== participant.id
  );
  const authors = [participant, ...extraParticipants].slice(0, ideas.length);
  if (authors.length < ideas.length) {
    throw new Error(`Six participants sont nécessaires; ${authors.length} trouvés.`);
  }

  await db.delete(event).where(like(event.slug, "demo-innolab-%"));

  for (const stage of stages) {
    const eventId = id.event();
    await db.insert(event).values({
      id: eventId,
      slug: stage.slug,
      name: stage.name,
      tagline: stage.tagline,
      description:
        "Événement de démonstration destiné aux captures du parcours Innolab. Les données sont fictives et peuvent être recréées.",
      content: doc(
        "Cette édition illustre une étape précise du parcours Innolab dans Juryza.",
        "Le parcours commence par les pitchs individuels, continue par la sélection et le travail en équipe, puis se termine par une évaluation réservée au jury désigné."
      ),
      rules: doc(
        "Les pitchs sont proposés individuellement avant la formation des équipes.",
        "Seuls les juges désignés par les administrateurs évaluent les projets finaux."
      ),
      mode: "in-person",
      location: "Genève",
      workflow: "innolab",
      hue: stage.hue,
      visibility: "published",
      isFixture: true,
      pitchSubmissionsOpen: at(stage.pitchOpen),
      pitchSubmissionsClose: at(stage.pitchClose),
      pitchVotingOpen: at(stage.pitchVoteOpen),
      pitchVotingClose: at(stage.pitchVoteClose),
      pitchPresentationOpenedAt: stage.pitchClose < 0 ? at(stage.pitchVoteOpen) : null,
      pitchSelectionCount: stage.pitchStatuses.includes("selected") ? 5 : null,
      pitchSelectionSeed: stage.pitchStatuses.includes("selected") ? `demo-${stage.slug}` : null,
      pitchSelectionFinalizedAt: stage.pitchStatuses.includes("selected")
        ? at(stage.pitchVoteClose)
        : null,
      submissionsOpen: at(stage.projectOpen),
      submissionsClose: at(stage.projectClose),
      judgingClose: at(stage.judgingClose),
      votingOpen: null,
      votingClose: null,
      resultsPublished: stage.resultsPublished,
      maxTeamSize: 6,
      reviewsPerProject: 2,
      votingAccess: "authenticated",
      voteBudget: 0,
      createdBy: admin.id,
    });

    const trackIds = [id.track(), id.track()] as const;
    await db.insert(track).values([
      {
        id: trackIds[0],
        eventId,
        name: "Expérience collaborateurs",
        description: "Simplifier le quotidien et renforcer la collaboration.",
        position: 0,
      },
      {
        id: trackIds[1],
        eventId,
        name: "Impact durable",
        description: "Créer un impact mesurable pour l’organisation et son environnement.",
        position: 1,
      },
    ]);

    await db.insert(rubricCriterion).values([
      {
        id: id.criterion(),
        eventId,
        key: "impact",
        label: "Impact",
        description: "Valeur créée pour les utilisateurs et l’organisation.",
        weight: 0.4,
        position: 0,
      },
      {
        id: id.criterion(),
        eventId,
        key: "feasibility",
        label: "Faisabilité",
        description: "Capacité à mettre la solution en œuvre et à la faire évoluer.",
        weight: 0.35,
        position: 1,
      },
      {
        id: id.criterion(),
        eventId,
        key: "presentation",
        label: "Présentation",
        description: "Clarté du problème, de la solution et de la démonstration.",
        weight: 0.25,
        position: 2,
      },
    ]);

    await db.insert(prize).values([
      {
        id: id.prize(),
        eventId,
        kind: "overall",
        name: "Prix Innovation Lab",
        description: "Premier projet du classement établi par le jury.",
        amount: "Trophée",
        rank: 1,
      },
      {
        id: id.prize(),
        eventId,
        kind: "overall",
        name: "Prix Coup de cœur",
        description: "Deuxième projet du classement établi par le jury.",
        amount: "Mention spéciale",
        rank: 2,
      },
    ]);

    await db
      .insert(registration)
      .values([
        ...authors.map((author) => ({ eventId, userId: author.id })),
        { eventId, userId: freeParticipant.id },
      ]);
    await db.insert(eventJudge).values([
      { eventId, userId: judgeA.id, trackIds: [] },
      { eventId, userId: judgeB.id, trackIds: [] },
    ]);
    await db.insert(announcement).values({
      id: id.announcement(),
      eventId,
      title: `Étape ${stage.name.match(/\d\/6/)?.[0] ?? "Innolab"}`,
      body: stage.announcement,
      pinned: true,
      authorId: admin.id,
    });

    const pitchIds: string[] = [];
    for (const [index, idea] of ideas.entries()) {
      const author = authors[index];
      if (!author) throw new Error(`Auteur manquant pour l’idée ${index + 1}.`);
      const status = stage.pitchStatuses[index] ?? "submitted";
      const pitchId = id.pitch();
      pitchIds.push(pitchId);
      await db.insert(pitch).values({
        id: pitchId,
        eventId,
        authorId: author.id,
        title: idea.title,
        description: idea.description,
        status,
        submittedAt: status === "draft" ? null : at(-Math.max(1, 20 - index)),
      });
    }

    const submittedPitches = pitchIds.flatMap((pitchId, index) =>
      stage.pitchStatuses[index] === "draft" || !pitchId
        ? []
        : [{ pitchId, author: authors[index] }]
    );
    for (const voter of authors) {
      const choice = submittedPitches.find(({ author }) => author?.id !== voter.id);
      if (!choice) continue;
      await db.insert(pitchVote).values({
        id: id.pitchVote(),
        eventId,
        pitchId: choice.pitchId,
        voterId: voter.id,
      });
    }

    const projectIds: string[] = [];
    if (stage.projects !== "none") {
      for (const [index, idea] of ideas.slice(0, 5).entries()) {
        const author = authors[index];
        const pitchId = pitchIds[index];
        if (!author || !pitchId)
          throw new Error(`Données projet manquantes à la position ${index + 1}.`);
        const teamId = id.team();
        const projectId = id.project();
        projectIds.push(projectId);
        await db.insert(team).values({
          id: teamId,
          eventId,
          name: idea.team,
          description: `Équipe formée autour du pitch « ${idea.title} ».`,
          lookingForMembers: stage.projects === "draft" && index < 2,
          inviteToken: `invite-${stage.slug}-${index + 1}`,
        });
        await db.insert(teamMember).values({
          teamId,
          userId: author.id,
          role: "owner",
        });
        await db.insert(project).values({
          id: projectId,
          eventId,
          teamId,
          pitchId,
          trackId: index % 2 === 0 ? trackIds[0] : trackIds[1],
          title: idea.project,
          tagline: idea.tagline,
          description: `${idea.description} Le prototype démontre le parcours principal et les indicateurs d’impact.`,
          content: doc(
            `Point de départ : ${idea.description}`,
            "La solution a été prototypée avec les utilisateurs, puis testée sur un scénario représentatif.",
            "La prochaine étape consiste à mesurer l’adoption et à préparer un pilote opérationnel."
          ),
          repoUrl: `https://github.com/juryza-demo/${stage.slug}-${index + 1}`,
          liveUrl: `https://demo.example.com/${stage.slug}/${index + 1}`,
          techTags: [...idea.tags],
          status: stage.projects,
          submittedAt: stage.projects === "submitted" ? at(-2) : null,
        });
      }
    }

    if (stage.judging !== "none") {
      const judgeAssignments = [
        { judge: judgeA, indexes: [0, 1, 2, 3] },
        { judge: judgeB, indexes: [1, 2, 3, 4] },
      ] as const;
      for (const group of judgeAssignments) {
        for (const [position, projectIndex] of group.indexes.entries()) {
          const projectId = projectIds[projectIndex];
          if (!projectId) throw new Error(`Projet manquant à la position ${projectIndex + 1}.`);
          await db.insert(assignment).values({
            id: id.assignment(),
            eventId,
            judgeId: group.judge.id,
            projectId,
            batch: position < 2 ? 1 : 2,
          });
          const shouldScore =
            stage.judging === "complete" ||
            (group.judge.id === judgeA.id ? position < 2 : position < 1);
          if (shouldScore) {
            const criteria =
              group.judge.id === judgeA.id ? marksA[projectIndex] : marksB[projectIndex];
            await db.insert(score).values({
              id: id.score(),
              eventId,
              judgeId: group.judge.id,
              projectId,
              criteria,
              comment:
                projectIndex < 2
                  ? "Proposition convaincante, bien reliée au besoin et clairement démontrée."
                  : "Bonne base. Le prochain pilote devra préciser les indicateurs de succès.",
            });
          }
        }
      }
    }

    console.info(`[demo] ${stage.slug} créé`);
  }

  console.info(`[demo] ${stages.length} événements Innolab prêts pour la présentation.`);
}

try {
  await main();
} finally {
  await pool.end();
}
