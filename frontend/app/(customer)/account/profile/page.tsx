import type { Metadata } from "next";
import { AccountTabs } from "@/components/account/account-tabs";
import { BackLink } from "@/components/layout/back-link";
import { PageTitle } from "@/components/order/page-title";
import { Alert } from "@/components/ui/alert";
import { getMyProfileAction } from "./actions";
import { ProfileEditor } from "./profile-editor";

export const metadata: Metadata = { title: "My details" };

export default async function MyDetailsPage() {
  const profile = await getMyProfileAction();

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">
      <BackLink href="/brands" label="Back to brands" />
      <div className="mt-4">
        <PageTitle label="Your account" title="My Details" subtitle="Your name, phone and delivery address, filled in for you at checkout." />
      </div>
      <AccountTabs active="profile" />

      <div className="mt-8">
        {profile.ok ? <ProfileEditor profile={profile.data} /> : <Alert tone="danger">{profile.error}</Alert>}
      </div>
    </div>
  );
}
