import Link from "next/link";

import { cn } from "@juryza/ui/lib/utils";

import { PRODUCT_NAME } from "@/lib/platform";

/** The Juryza mark: the gavel and verification checkmark mark in a rounded square. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative flex size-8 shrink-0 items-center justify-center rounded-lg overflow-hidden shadow-sm transition-transform hover:scale-105",
        className
      )}
      aria-hidden
    >
      <svg
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="size-full"
        aria-hidden="true"
      >
        <title>{PRODUCT_NAME}</title>
        <defs>
          <linearGradient
            id="juryzaBgGrad"
            x1="0"
            y1="0"
            x2="32"
            y2="32"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#0f172a" />
            <stop offset="0.5" stopColor="#1e293b" />
            <stop offset="1" stopColor="#090d16" />
          </linearGradient>
          <linearGradient
            id="juryzaGavel"
            x1="12"
            y1="6"
            x2="20"
            y2="20"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#ffffff" />
            <stop offset="1" stopColor="#e2e8f0" />
          </linearGradient>
          <linearGradient
            id="juryzaCheck"
            x1="13"
            y1="8"
            x2="19"
            y2="18"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#10b981" />
            <stop offset="1" stopColor="#059669" />
          </linearGradient>
        </defs>

        {/* Squircle Background with crisp subtle ring */}
        <rect width="32" height="32" rx="7.5" fill="url(#juryzaBgGrad)" />
        <rect x="0.5" y="0.5" width="31" height="31" rx="7" stroke="#ffffff" strokeOpacity="0.12" />

        {/* Data Graph Nodes on Left */}
        <circle cx="5" cy="11" r="1.1" fill="#60a5fa" opacity="0.8" />
        <circle cx="5" cy="16" r="1.1" fill="#34d399" />
        <circle cx="5" cy="21" r="1.1" fill="#60a5fa" opacity="0.8" />
        <line
          x1="5"
          y1="11"
          x2="5"
          y2="21"
          stroke="#3b82f6"
          strokeWidth="0.75"
          strokeDasharray="1.5 1"
          opacity="0.4"
        />
        <line x1="5" y1="16" x2="9" y2="16" stroke="#10b981" strokeWidth="0.75" opacity="0.5" />

        {/* Data Graph Nodes on Right */}
        <circle cx="27" cy="11" r="1.1" fill="#60a5fa" opacity="0.8" />
        <circle cx="27" cy="16" r="1.1" fill="#34d399" />
        <circle cx="27" cy="21" r="1.1" fill="#60a5fa" opacity="0.8" />
        <line
          x1="27"
          y1="11"
          x2="27"
          y2="21"
          stroke="#3b82f6"
          strokeWidth="0.75"
          strokeDasharray="1.5 1"
          opacity="0.4"
        />
        <line x1="27" y1="16" x2="23" y2="16" stroke="#10b981" strokeWidth="0.75" opacity="0.5" />

        {/* Gavel Base Sound Block */}
        <rect x="7" y="24" width="18" height="2.8" rx="1.4" fill="#ffffff" />
        <rect x="8.5" y="22.5" width="15" height="1.8" rx="0.9" fill="#cbd5e1" />

        {/* Gavel Handle */}
        <path d="M18.5 14.5L25.5 19.5" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="25.5" cy="19.5" r="1.2" fill="#e2e8f0" />

        {/* Gavel Head Caps */}
        <rect x="9.5" y="5.5" width="13" height="2.2" rx="1.1" fill="#f8fafc" />
        <rect x="9.5" y="19" width="13" height="2.2" rx="1.1" fill="#e2e8f0" />

        {/* Gavel Head Body */}
        <rect x="11" y="7" width="10" height="12.5" rx="1.8" fill="url(#juryzaGavel)" />

        {/* 3 Green Verification Checkmarks */}
        <path
          d="M13 10.2L14.8 12L18.5 8.5"
          stroke="url(#juryzaCheck)"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M13 13.7L14.8 15.5L18.5 12"
          stroke="url(#juryzaCheck)"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M13 17.2L14.8 19L18.5 15.5"
          stroke="url(#juryzaCheck)"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link
      href={href}
      className={cn("flex items-center gap-2.5 font-semibold tracking-tight", className)}
    >
      <LogoMark />
      <span className="text-[1.05rem] font-bold tracking-tight">{PRODUCT_NAME}</span>
    </Link>
  );
}
