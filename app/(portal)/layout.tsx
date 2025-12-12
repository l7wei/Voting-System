import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "NTHUSA Student Portal",
  description: "National Tsing Hua University Student Association Portal",
};

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
