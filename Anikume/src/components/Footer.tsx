import { Link } from "@tanstack/react-router";
import { Logo } from "./Logo";
import { MessageSquare } from "lucide-react";

function GithubIcon(props: any) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.02c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A4.8 4.8 0 0 0 8 18v4"></path>
    </svg>
  );
}

function TwitterIcon(props: any) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"></path>
    </svg>
  );
}

export function Footer() {
  const exploreLinks = [
    { label: "Home", to: "/" },
    { label: "Browse Anime", to: "/anime/browse" },
    { label: "Schedule", to: "/anime/schedule" },
    { label: "Notifications", to: "/notification" },
  ];

  return (
    <footer className="border-t border-white/10 bg-background/40 px-4 py-12 sm:px-6 lg:px-8 backdrop-blur-xl">
      <div className="mx-auto max-w-[1500px]">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-4 lg:gap-8">
          <div className="md:col-span-3">
            <Logo />
            <p className="mt-6 max-w-md text-sm leading-relaxed text-muted-foreground">
              AniKume is your ad-free destination for discovering and streaming anime. We
              do not host any files ourselves; all content is provided by non-affiliated third
              parties.
            </p>
            <div className="mt-6 flex items-center gap-4">
              <a
                href="https://twitter.com"
                target="_blank"
                rel="noreferrer"
                aria-label="Twitter"
                className="text-muted-foreground transition hover:text-foreground hover:scale-110"
              >
                <TwitterIcon className="size-5" />
              </a>
              <a
                href="https://discord.com"
                target="_blank"
                rel="noreferrer"
                aria-label="Discord"
                className="text-muted-foreground transition hover:text-foreground hover:scale-110"
              >
                <MessageSquare className="size-5" />
              </a>
              <a
                href="https://github.com"
                target="_blank"
                rel="noreferrer"
                aria-label="GitHub"
                className="text-muted-foreground transition hover:text-foreground hover:scale-110"
              >
                <GithubIcon className="size-5" />
              </a>
            </div>
          </div>

          <div>
            <h3 className="font-semibold tracking-wide text-foreground">Explore</h3>
            <ul className="mt-5 flex flex-col gap-3 text-sm">
              {exploreLinks.map((l) => (
                <li key={l.label}>
                  <Link
                    to={l.to as any}
                    className="text-muted-foreground transition hover:text-foreground hover:underline"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-16 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 sm:flex-row">
          <p className="text-sm text-muted-foreground flex items-center gap-1.5">
            © AniKume . all copyrights reserved
          </p>
          <div className="flex gap-6 text-sm text-muted-foreground">
            <Link to="/terms" className="transition hover:text-foreground">
              Terms
            </Link>
            <Link to="/privacy" className="transition hover:text-foreground">
              Privacy
            </Link>
            <Link to="/dmca" className="transition hover:text-foreground">
              DMCA
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
