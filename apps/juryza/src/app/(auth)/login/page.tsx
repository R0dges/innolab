import { Suspense } from "react";

import { LoginForm, type DemoAccount } from "./login-form";

const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    id: "participant",
    label: "Participant",
    email: "participant@juryza.test",
    password: "participant-password-123",
  },
  {
    id: "participant-free",
    label: "Participant libre",
    email: "participant.free@juryza.test",
    password: "participant-free-password-123",
  },
  {
    id: "coach-a",
    label: "Coach A",
    email: "judge.a@juryza.test",
    password: "judge-a-password-123",
  },
  {
    id: "coach-b",
    label: "Coach B",
    email: "judge.b@juryza.test",
    password: "judge-b-password-123",
  },
  {
    id: "admin",
    label: "Administrateur",
    email: "admin@juryza.test",
    password: "admin-password-123",
  },
  {
    id: "organizer",
    label: "Organisateur historique",
    email: "organizer@juryza.test",
    password: "organizer-password-123",
  },
];

export default function LoginPage() {
  const demoAccounts =
    process.env.NODE_ENV === "development" || process.env.SHOW_DEMO_ACCOUNTS === "true"
      ? DEMO_ACCOUNTS
      : [];

  return (
    <Suspense>
      <LoginForm demoAccounts={demoAccounts} />
    </Suspense>
  );
}
