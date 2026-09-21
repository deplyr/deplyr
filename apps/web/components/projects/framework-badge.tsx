import type { Framework } from "@deplyr/shared-types";
import { Badge } from "@/components/ui/badge";

const LABELS: Record<Framework, string> = {
  nextjs: "Next.js",
  nestjs: "NestJS",
  node: "Node",
  dockerfile: "Docker",
};

export function FrameworkBadge({ framework }: { framework: Framework | null }) {
  if (!framework) return <Badge tone="danger">Not supported</Badge>;
  return <Badge tone="neutral">{LABELS[framework]}</Badge>;
}
