import type { Framework } from "@argo/shared-types";
import { Badge } from "@/components/ui/badge";

export function FrameworkBadge({ framework }: { framework: Framework | null }) {
  if (!framework) return <Badge tone="danger">Not supported</Badge>;
  return <Badge tone="neutral">{framework === "nextjs" ? "Next.js" : "Node"}</Badge>;
}
