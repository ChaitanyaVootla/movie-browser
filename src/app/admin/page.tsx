import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AdminDashboard } from "./client";

export const metadata: Metadata = {
  title: "Admin Dashboard",
  description: "Admin dashboard for Movie Browser",
  robots: { index: false, follow: false },
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
