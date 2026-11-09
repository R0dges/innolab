"use client";

import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { KeyRound, LogOut, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@juryza/ui/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@juryza/ui/components/ui/alert-dialog";
import { Badge } from "@juryza/ui/components/ui/badge";
import { Button } from "@juryza/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@juryza/ui/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@juryza/ui/components/ui/field";
import { Input } from "@juryza/ui/components/ui/input";
import { PasswordInput } from "@juryza/ui/components/ui/password-input";
import { Spinner } from "@juryza/ui/components/ui/spinner";

import { useViewer } from "@/components/viewer";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { formatDate } from "@/lib/format";

/**
 * Account settings: sign-in email and platform role (read-only), password
 * change (which also signs out other devices), and "sign out everywhere".
 */

const ROLE_HINT: Record<string, string> = {
  participant: "Join events, form teams and submit projects.",
  judge: "Everything a participant can do, plus scoring projects on panels you're invited to.",
  organizer: "Create and run events: rubric, judges, rewards, results.",
  admin: "Full access to the instance, including user roles.",
};

export default function AccountSettingsPage() {
  const viewer = useViewer();
  const { data } = useQuery({
    queryKey: ["me"],
    queryFn: () => api.get<{ user: { email: string; role: string; createdAt: string } }>("/api/me"),
  });
  const email = data?.user.email ?? viewer?.email ?? "";
  const role = data?.user.role ?? viewer?.role ?? "participant";

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const mismatch = confirm.length > 0 && confirm !== next;
  const tooShort = next.length > 0 && next.length < 8;

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mismatch || tooShort || !current || !next) return;
    setSaving(true);
    setError(null);
    const { error: err } = await authClient.changePassword({
      currentPassword: current,
      newPassword: next,
      revokeOtherSessions: true,
    });
    setSaving(false);
    if (err) {
      setError(err.message ?? "Could not change your password");
      return;
    }
    setCurrent("");
    setNext("");
    setConfirm("");
    toast.success("Password changed", { description: "Other devices have been signed out." });
  };

  const signOutEverywhere = async () => {
    setSigningOut(true);
    const { error: err } = await authClient.revokeSessions();
    if (err) {
      setSigningOut(false);
      toast.error(err.message ?? "Could not sign out");
      return;
    }
    window.location.assign("/login");
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>
            {data?.user.createdAt
              ? `Member since ${formatDate(data.user.createdAt)}`
              : "Your sign-in identity."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input id="email" value={email} readOnly disabled />
              <FieldDescription>
                Used to sign in and for judging invitations. Contact an admin to change it.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel>Platform role</FieldLabel>
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={role === "admin" || role === "organizer" ? "default" : "secondary"}
                  className="capitalize"
                >
                  {role}
                </Badge>
                <span className="text-muted-foreground text-sm">{ROLE_HINT[role]}</span>
              </div>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="size-4" /> Change password
          </CardTitle>
          <CardDescription>Changing it signs you out on every other device.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={changePassword}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="current-password">Current password</FieldLabel>
                <PasswordInput
                  id="current-password"
                  autoComplete="current-password"
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  required
                />
              </Field>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field data-invalid={tooShort ? true : undefined}>
                  <FieldLabel htmlFor="new-password">New password</FieldLabel>
                  <PasswordInput
                    id="new-password"
                    autoComplete="new-password"
                    value={next}
                    onChange={(e) => setNext(e.target.value)}
                    aria-invalid={tooShort ? true : undefined}
                    required
                  />
                  {tooShort ? (
                    <FieldError>At least 8 characters</FieldError>
                  ) : (
                    <FieldDescription>At least 8 characters.</FieldDescription>
                  )}
                </Field>
                <Field data-invalid={mismatch ? true : undefined}>
                  <FieldLabel htmlFor="confirm-password">Confirm new password</FieldLabel>
                  <PasswordInput
                    id="confirm-password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    aria-invalid={mismatch ? true : undefined}
                    required
                  />
                  {mismatch && <FieldError>Passwords don't match</FieldError>}
                </Field>
              </div>
              {error && (
                <Alert variant="destructive">
                  <ShieldAlert />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div>
                <Button
                  type="submit"
                  disabled={saving || !current || !next || !confirm || mismatch || tooShort}
                >
                  {saving && <Spinner />} Update password
                </Button>
              </div>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-destructive">Sessions</CardTitle>
          <CardDescription>
            Lost a laptop or signed in on a shared computer? End every session, including this one.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Alert>
            <ShieldAlert />
            <AlertTitle>Personal API tokens keep working</AlertTitle>
            <AlertDescription>
              Signing out doesn't revoke tokens — revoke those separately under API tokens.
            </AlertDescription>
          </Alert>
          <AlertDialog>
            <AlertDialogTrigger
              render={<Button variant="destructive" className="self-start" disabled={signingOut} />}
            >
              {signingOut ? <Spinner /> : <LogOut />} Sign out everywhere
            </AlertDialogTrigger>
            <AlertDialogContent size="sm">
              <AlertDialogHeader>
                <AlertDialogTitle>Sign out of every device?</AlertDialogTitle>
                <AlertDialogDescription>
                  All sessions end immediately, including this one. You'll need to sign in again.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={signOutEverywhere}
                  disabled={signingOut}
                >
                  {signingOut && <Spinner />} Sign out everywhere
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}
