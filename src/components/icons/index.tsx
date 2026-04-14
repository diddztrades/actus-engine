import type { SVGProps } from "react";

function IconBase({
  children,
  ...props
}: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  );
}

export function SearchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </IconBase>
  );
}

export function BellIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M15 17H5.5a1.5 1.5 0 0 1-1.2-2.4C5.5 13 6 11.5 6 10V8a6 6 0 1 1 12 0v2c0 1.5.5 3 1.7 4.6A1.5 1.5 0 0 1 18.5 17H15" />
      <path d="M9 17a3 3 0 0 0 6 0" />
    </IconBase>
  );
}

export function AlertIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M12 3 2.8 19a1 1 0 0 0 .9 1.5h16.6a1 1 0 0 0 .9-1.5L12 3Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </IconBase>
  );
}

export function TrendUpIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M4 16 10 10l4 4 6-8" />
      <path d="M20 6v4h-4" />
    </IconBase>
  );
}

export function TrendDownIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M4 8 10 14l4-4 6 8" />
      <path d="M20 18v-4h-4" />
    </IconBase>
  );
}

export function ZapIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
    </IconBase>
  );
}

export function ShieldIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M12 3c2.5 2 5.5 2.5 8 3v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6c2.5-.5 5.5-1 8-3Z" />
    </IconBase>
  );
}