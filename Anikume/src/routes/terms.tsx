import { createFileRoute } from "@tanstack/react-router";
import { Footer } from "@/components/Footer";

export const Route = createFileRoute("/terms")({
  component: TermsPage,
});

function TermsPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 px-4 py-24 sm:px-6 lg:px-8 mx-auto max-w-4xl w-full">
        <h1 className="text-3xl font-bold mb-8">Terms of Service</h1>
        <div className="space-y-10 text-muted-foreground leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">
              Service Model: How We Operate
            </h2>
            <p className="mb-3">
              AniKume functions as a search engine and content aggregator that indexes publicly
              available media from across the internet.
            </p>
            <p className="mb-3">
              We don't host, store, or control any media files - everything is sourced from external
              third-party websites that are already publicly accessible.
            </p>
            <p>
              Our automated systems simply provide links to content that's already available online,
              without bypassing any security measures.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">
              User Responsibilities: User Guidelines
            </h2>
            <p className="mb-3">
              Users are responsible for ensuring their access complies with local laws and
              regulations in their jurisdiction.
            </p>
            <p className="mb-3">
              We strongly recommend using VPN services for enhanced privacy and security while
              browsing. Downloading is not advised.
            </p>
            <p>
              Please respect intellectual property rights and be mindful of copyright laws in your
              area.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">
              Terms & Conditions: Service Terms
            </h2>
            <p className="mb-3">AniKume is licensed under the MIT license.</p>
            <p className="mb-3">
              By using our platform, you acknowledge these terms and agree that we're not
              responsible for third-party content.
            </p>
            <p>
              We operate in good faith compliance with applicable laws and regulations. We are not
              liable for any damages or losses incurred while using our service.
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
