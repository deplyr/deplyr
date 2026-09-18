import { Github } from "lucide-react";
import { Button } from "@/components/ui/button";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function LoginPage() {
  return (
    <div className="w-full max-w-sm rounded-lg border border-border bg-surface/40 p-8 text-center">
      <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-accent text-base font-bold text-accent-foreground">
        A
      </div>
      <h1 className="text-lg font-semibold">Sign in to Argo</h1>
      <p className="mt-1.5 text-sm text-muted">
        One GitHub sign-in covers your account and lets Argo see the repos
        you deploy.
      </p>
      <a href={`${API_URL}/auth/github/login`} className="mt-6 block">
        <Button className="w-full">
          <Github className="h-4 w-4" strokeWidth={1.75} />
          Continue with GitHub
        </Button>
      </a>
    </div>
  );
}
