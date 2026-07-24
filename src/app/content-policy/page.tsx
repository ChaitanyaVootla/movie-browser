import type { Metadata } from "next";
import { PageMain } from "@/components/features/layout/page-main";
import { SITE_URL } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Content Policy",
  description:
    "Community rules for discussions on The Movie Browser: spoiler etiquette, prohibited content, AI moderation, and how reporting and enforcement work.",
  alternates: {
    canonical: `${SITE_URL}/content-policy`,
  },
};

export default function ContentPolicyPage() {
  return (
    <PageMain className="max-w-3xl mx-auto">
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-6">Content Policy</h1>
      <div className="space-y-8 text-sm leading-relaxed text-foreground/90">
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">The spirit</h2>
          <p>
            Discussions here exist so people can talk about movies and shows without being spoiled
            and without being attacked. Disagree about the art as hard as you like; leave the
            people out of it.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Spoiler etiquette</h2>
          <p>
            Every comment carries a spoiler scope (none, up-to-an-episode, watched, or ending).
            Readers only see comments their own watch progress unlocks. Tag honestly — our AI
            suggests a scope when a comment looks spoilery, and you confirm or adjust it before
            publishing. Deliberately mis-tagged spoilers are removable and repeat offenses may
            lead to restrictions.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Not allowed</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Harassment, bullying, or threats against anyone.</li>
            <li>Hate speech or slurs targeting protected groups.</li>
            <li>Sexual content involving minors — zero tolerance, reported where required by law.</li>
            <li>Doxxing or sharing anyone&apos;s private information.</li>
            <li>Spam, advertising, link farming, or engagement manipulation.</li>
            <li>Piracy links or instructions for accessing content illegally.</li>
            <li>Impersonation of other people or of The Movie Browser staff.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">How moderation works</h2>
          <p>
            Every comment passes an automated AI check before or shortly after it becomes visible.
            The AI classifies content only — it flags toxicity and suggests spoiler scopes; it
            never rates, profiles, or characterizes you. Flagged comments are held for human
            review. Moderators can publish, remove, or restrict.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Reporting and enforcement</h2>
          <p>
            Use the report option on any comment. Reports go to a human-reviewed queue. Depending
            on severity we may remove content, hold future comments for review, or suspend
            accounts. You can also block (mutual invisibility) or mute (one-way hide) any user
            from their profile.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Your content</h2>
          <p>
            You own what you write. Deleting a comment scrubs its text immediately; the thread
            structure around it survives so replies keep their context. Deleting your account
            removes your name from all of your comments.
          </p>
        </section>

        <p className="text-xs text-muted-foreground">Last updated: June 2026</p>
      </div>
    </PageMain>
  );
}
