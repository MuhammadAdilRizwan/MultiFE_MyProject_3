import type { Metadata } from "next";
import { AcceptInvite } from "./accept-invite";

export const metadata: Metadata = { title: "Accept your invite" };

export default function AcceptInvitePage() {
  return <AcceptInvite />;
}
