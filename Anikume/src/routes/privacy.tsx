import { createFileRoute } from "@tanstack/react-router";
import { Footer } from "@/components/Footer";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 px-4 py-24 sm:px-6 lg:px-8 mx-auto max-w-4xl w-full">
        <h1 className="text-3xl font-bold mb-8">Privacy Policy</h1>
        <div className="space-y-10 text-muted-foreground leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">
              Data Protection: Privacy & Data
            </h2>
            <p className="mb-3">
              User privacy is important to us. We don't collect, store, or track any personal
              information about our users.
            </p>
            <p className="mb-3">
              Optionally, users can store their bookmarks and watch history in our encrypted
              backend. But we don't store any personal information or identifying data.
            </p>
            <p>
              AniKume is entirely self hostable, and can be run on any server. Even by yourself.
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
