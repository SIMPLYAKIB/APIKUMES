import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Wrench } from "lucide-react";

export function MaintenanceView({ title = "Manga Under Maintenance" }: { title?: string }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Header />
      <main className="flex-1 flex flex-col items-center justify-center p-8 text-center mt-[-60px]">
        <div className="size-20 rounded-full bg-white/5 flex items-center justify-center mb-6">
          <Wrench className="size-10 text-white/40" />
        </div>
        <h1 className="text-3xl font-bold mb-4">{title}</h1>
        <p className="text-lg text-white/60 max-w-md">
          We're currently upgrading our manga systems to provide a better reading experience. Please
          check back later!
        </p>
      </main>
      <Footer />
    </div>
  );
}
