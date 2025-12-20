import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AdminDashboard } from "./client";

export const metadata = {
  title: "Admin Dashboard",
  description: "Admin dashboard for Movie Browser",
  robots: "noindex, nofollow",
};

export default async function AdminPage() {
  const session = await auth();

  // Redirect if not authenticated
  if (!session?.user) {
    redirect("/auth/signin?callbackUrl=/admin");
  }

  // Redirect if not admin
  if (session.user.role !== "admin") {
    redirect("/");
  }

  return <AdminDashboard />;
}


