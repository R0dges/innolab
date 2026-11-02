"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@juryza/ui/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@juryza/ui/components/ui/field";
import { Input } from "@juryza/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@juryza/ui/components/ui/select";
import { Spinner } from "@juryza/ui/components/ui/spinner";
import { toast } from "sonner";

import { useI18n } from "@/components/locale-provider";
import { signIn } from "@/lib/auth-client";

export interface DemoAccount {
  id: string;
  label: string;
  email: string;
  password: string;
}

function safeNext(next: string | null) {
  return next?.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

export function LoginForm({ demoAccounts }: { demoAccounts: DemoAccount[] }) {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selectedDemo, setSelectedDemo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const { t } = useI18n();

  const demoOptions = [
    { label: t("auth.demoChoose"), value: null },
    ...demoAccounts.map((account) => ({ label: account.label, value: account.id })),
  ];

  const selectDemo = (id: string | null) => {
    setSelectedDemo(id);
    const account = demoAccounts.find((candidate) => candidate.id === id);
    if (!account) return;
    setEmail(account.email);
    setPassword(account.password);
  };

  const submit = async () => {
    setPending(true);
    const { error } = await signIn.email({ email, password });
    setPending(false);
    if (error) {
      toast.error(error.message ?? t("auth.error"));
      return;
    }
    router.push(next);
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("auth.title")}</h1>
        <p className="text-muted-foreground text-sm">{t("auth.description")}</p>
      </div>

      {demoAccounts.length > 0 ? (
        <>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="demo-account">{t("auth.demo")}</FieldLabel>
              <Select
                items={demoOptions}
                value={selectedDemo}
                onValueChange={selectDemo}
                disabled={pending}
              >
                <SelectTrigger id="demo-account" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectGroup>
                    {demoOptions.map((option) => (
                      <SelectItem key={option.value ?? "placeholder"} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>
                {t("auth.demoHint")}
              </FieldDescription>
            </Field>
          </FieldGroup>
          <FieldSeparator>{t("auth.manual")}</FieldSeparator>
        </>
      ) : null}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="email">{t("auth.email")}</FieldLabel>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setSelectedDemo(null);
              }}
              placeholder="you@example.com"
            />
          </Field>
          <Field>
            <div className="flex items-center justify-between">
              <FieldLabel htmlFor="password">{t("auth.password")}</FieldLabel>
              <Link
                href="/forgot-password"
                className="text-muted-foreground hover:text-foreground text-xs"
              >
                {t("auth.forgot")}
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setSelectedDemo(null);
              }}
            />
          </Field>
          <Button type="submit" disabled={pending}>
            {pending ? <Spinner /> : null} {t("auth.submit")}
          </Button>
        </FieldGroup>
      </form>

    </div>
  );
}
