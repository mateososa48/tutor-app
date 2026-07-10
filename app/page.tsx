import { auth } from "@/lib/auth";
import HomePage from "@/components/HomePage";
import LandingPage from "@/components/landing/LandingPage";

export const dynamic = "force-dynamic";

export default async function RootPage() {
  const session = await auth();
  if (session?.user?.id) return <HomePage />;
  return <LandingPage />;
}
