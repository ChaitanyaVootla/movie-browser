import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageMain } from "@/components/features/layout/page-main";
import { SectionHeading } from "@/components/features/layout/section-heading";
import { NotificationList } from "@/components/features/notifications/notification-list";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Notifications",
  robots: "noindex, nofollow",
};

export default async function NotificationsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/auth/signin?callbackUrl=/notifications");
  }
  return (
    <PageMain className="max-w-2xl mx-auto">
      <SectionHeading className="mb-4">Notifications</SectionHeading>
      <NotificationList />
    </PageMain>
  );
}
