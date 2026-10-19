interface InnolabDates {
  workflow: string;
  pitchSubmissionsOpen: Date | string | null;
  pitchSubmissionsClose: Date | string | null;
  pitchVotingOpen: Date | string | null;
  pitchVotingClose: Date | string | null;
  submissionsOpen: Date | string | null;
  submissionsClose: Date | string;
}

const time = (value: Date | string | null | undefined) =>
  value ? new Date(value).getTime() : null;

export const isInnolab = (event: Pick<InnolabDates, "workflow">) => event.workflow === "innolab";

const projectSubmissionsAreOpen = (event: InnolabDates, now: number) => {
  const open = time(event.submissionsOpen);
  const close = time(event.submissionsClose) ?? 0;
  return (open === null || now >= open) && now < close;
};

export function pitchSubmissionsAreOpen(event: InnolabDates, now = Date.now()): boolean {
  if (!isInnolab(event)) return false;
  const open = time(event.pitchSubmissionsOpen);
  const close = time(event.pitchSubmissionsClose);
  if (close === null) return false;
  return (open === null || now >= open) && now < close;
}

export function pitchVotingIsOpen(event: InnolabDates, now = Date.now()): boolean {
  if (!isInnolab(event)) return false;
  const open = time(event.pitchVotingOpen);
  const close = time(event.pitchVotingClose);
  if (open === null || close === null) return false;
  return now >= open && now < close;
}

export function pitchVotingHasClosed(event: InnolabDates, now = Date.now()): boolean {
  const close = time(event.pitchVotingClose);
  return isInnolab(event) && close !== null && now >= close;
}

/** Innolab registration spans the pitch phase through the project deadline. */
export function eventRegistrationIsOpen(event: InnolabDates, now = Date.now()): boolean {
  if (!isInnolab(event)) return projectSubmissionsAreOpen(event, now);
  const open = time(event.pitchSubmissionsOpen);
  const close = time(event.submissionsClose);
  return close !== null && (open === null || now >= open) && now < close;
}

export function innolabProjectFormationIsOpen(event: InnolabDates, now = Date.now()): boolean {
  return pitchVotingHasClosed(event, now) && projectSubmissionsAreOpen(event, now);
}
