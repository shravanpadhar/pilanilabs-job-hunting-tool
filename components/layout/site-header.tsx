import { Logo } from "@/components/layout/logo";
import { SiteNav } from "@/components/layout/site-nav";
import { getCurrentUser } from "@/lib/auth";

export async function SiteHeader() {
  let user = null;
  try {
    user = await getCurrentUser();
  } catch {
    // Database / auth unavailable: render the signed-out header rather than crashing every page.
  }
  return (
    <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
      <div className="relative mx-auto flex h-16 max-w-6xl items-center px-4 sm:px-6">
        <Logo />
        <SiteNav signedIn={Boolean(user)} email={user?.email} />
      </div>
    </header>
  );
}
