import type { Metadata } from "next";
import { AccountTabs } from "@/components/account/account-tabs";
import { BackLink } from "@/components/layout/back-link";
import { PageTitle } from "@/components/order/page-title";
import { Alert } from "@/components/ui/alert";
import { getMyMeasurementsAction } from "./actions";
import { MeasurementsEditor } from "./measurements-editor";

export const metadata: Metadata = { title: "My measurements" };

export default async function MyMeasurementsPage() {
  const saved = await getMyMeasurementsAction();

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">
      <BackLink href="/brands" label="Back to brands" />
      <div className="mt-4">
        <PageTitle
          label="Your account"
          title="My Measurements"
          subtitle="Saved here, they're filled in for you on your next order."
        />
      </div>
      <AccountTabs active="measurements" />

      <div className="mt-8">
        {saved.ok ? <MeasurementsEditor saved={saved.data} /> : <Alert tone="danger">{saved.error}</Alert>}
      </div>
    </div>
  );
}
