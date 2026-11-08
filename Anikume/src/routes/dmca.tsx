import { createFileRoute } from "@tanstack/react-router";
import { Footer } from "@/components/Footer";

export const Route = createFileRoute("/dmca")({
  component: DMCAPage,
});

function DMCAPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 px-4 py-24 sm:px-6 lg:px-8 mx-auto max-w-4xl w-full">
        <h1 className="text-3xl font-bold mb-8">DMCA Policy</h1>
        <div className="space-y-10 text-muted-foreground leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">
              Copyright Policy: Content & Copyright
            </h2>
            <p className="mb-3">
              Since we don't host any content ourselves, all takedown requests must go directly to
              the websites that actually host the files.
            </p>
            <p className="mb-3">
              We respect intellectual property rights and will cooperate with valid legal requests
              within our technical capabilities.
            </p>
            <p className="mb-3">
              For content removal, please contact the original hosting platform - we cannot remove
              what we don't control.
            </p>
            <p>
              If you are a copyright holder and want to report a violation, we are more than happy
              to point you to where we found the content.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">
              Legal Contact: Legal Inquiries
            </h2>
            <p className="mb-3">
              For legal matters related to specific content, please contact the hosting websites
              directly as they have control over their files.
            </p>
            <p>
              AniKume operates within legal boundaries and cooperates with legitimate requests when
              technically feasible.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">Contact</h2>
            <p>
              Email:{" "}
              <a
                href="mailto:anikume@protonmail.com"
                className="text-[var(--brand,#df7426)] hover:underline"
              >
                anikume@protonmail.com
              </a>
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
