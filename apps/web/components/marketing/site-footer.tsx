import Link from "next/link";
import { Github } from "lucide-react";

const GITHUB_URL = "https://github.com/deplyr/deplyr";

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 py-8 text-sm text-muted sm:flex-row sm:justify-between sm:px-8">
        <p className="text-center sm:text-left">
          <span className="font-medium text-foreground">Deplyr</span> — open source, MIT licensed. Developed by{" "}
          <a href="https://abhilaksharora.com" target="_blank" rel="noreferrer" className="font-medium text-foreground underline-offset-4 transition hover:underline">
            Abhilaksh Arora
          </a>
          .
        </p>
        <div className="flex items-center gap-5">
          <Link href="/docs" className="transition hover:text-foreground">
            Documentation
          </Link>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 transition hover:text-foreground">
            <Github className="h-4 w-4" strokeWidth={1.75} />
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}
