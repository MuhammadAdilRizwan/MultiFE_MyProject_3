import type { Metadata } from "next";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { STANDARD_MEASUREMENTS } from "@multife/backend/modules/rules/standardMeasurements";
import { getCurrentProfile } from "@multife/backend/modules/users/getActor";
import { BackLink } from "@/components/layout/back-link";
import { JobActions } from "@/components/production/job-actions";
import { PrintButton } from "@/components/ui/print-button";
import { Alert } from "@/components/ui/alert";
import { formatMetres } from "@/lib/catalog";
import { logMessage } from "@/lib/describe-error";
import { formatOrderDate } from "@/lib/order-status";
import { getMyJob, listMyPastJobs } from "@/lib/production-jobs";
import { changedMeasurements, isProductionRole, nextStep, stageLabel } from "@/lib/production-stage";
import { createClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: "Job sheet" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LABELS = new Map(STANDARD_MEASUREMENTS.map((f) => [f.key, f.label]));
const measurementLabel = (key: string, fields: { key: string; label: string }[]) =>
  fields.find((f) => f.key === key)?.label ?? LABELS.get(key) ?? key.replace(/_/g, " ");

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-PK", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

// FR-PRD-09: one job's sheet — order number, design, fabric, measurements —
// with the next step for the signed-in staff member. Printable.
export default async function JobSheetPage({ params }: Props) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const profile = await getCurrentProfile(supabase);
  if (!profile || !isProductionRole(profile.role)) redirect("/");

  const job = await getMyJob(id).catch((error: unknown) => {
    console.error("getMyJob failed:", logMessage(error));
    return undefined;
  });
  if (job === null) {
    // Handed on (sent to QC, or QC sent it back): it's no longer this person's
    // job, so go to their Done list instead of a 404.
    const past = await listMyPastJobs().catch(() => []);
    const handed = past.find((p) => p.id === id);
    if (handed) redirect(`/production?view=done&handed=${encodeURIComponent(handed.orderNumber)}`);
    notFound();
  }
  if (job === undefined) return <Alert tone="danger">We couldn&apos;t load this job. Please refresh to try again.</Alert>;

  const step = nextStep(job.stage, job.orderStatus, profile.role);
  const corrected = job.approvedAt ? changedMeasurements(job.confirmedMeasurements, job.measurements) : [];
  const fields = job.requiredFields.length
    ? job.requiredFields
    : Object.keys(job.measurements).map((key) => ({ key, label: measurementLabel(key, []), unit: "cm", min: 0, max: 0 }));

  return (
    <div>
      <div className="flex items-center justify-between gap-3 print:hidden">
        <BackLink href="/production" label="My jobs" />
        <PrintButton />
      </div>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-ocean">Job sheet</p>
          <h1 className="mt-1 font-display text-3xl leading-tight text-ink sm:text-4xl">{job.orderNumber}</h1>
          <p className="mt-1 text-base text-muted">
            {job.templateName}
            {job.fabricName && ` · ${job.fabricName}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {job.priority > 0 && <span className="rounded-full bg-orange/15 px-3 py-1.5 font-bold text-orange">Urgent</span>}
          <span className="rounded-full bg-cyan-bright/10 px-3 py-1.5 font-bold text-ocean">{stageLabel(job.stage)}</span>
          {job.dueDate && (
            <span className="rounded-full bg-cream px-3 py-1.5 font-bold text-ink">Due {formatOrderDate(job.dueDate)}</span>
          )}
        </div>
      </div>

      <div className="mt-6 print:hidden">
        <JobActions
          jobId={job.id}
          step={step}
          fields={fields}
          measurements={job.measurements}
          threshold={job.correctionThreshold}
          correction={job.correction}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,20rem)_1fr] lg:items-start print:block">
        <Section title="Fabric">
          <div className="flex gap-4 lg:flex-col">
            <span className="relative flex aspect-square w-28 flex-none items-center justify-center overflow-hidden rounded-2xl bg-cream lg:w-full">
              {job.fabricImage ? (
                <Image src={job.fabricImage} alt={job.fabricName ? `${job.fabricName} fabric` : "Fabric"} fill sizes="(min-width: 1024px) 20rem, 7rem" className="object-cover" />
              ) : (
                <span aria-hidden="true" className="font-display text-4xl text-hint">
                  {(job.fabricName ?? "F").charAt(0)}
                </span>
              )}
            </span>
            <dl className="space-y-2 text-sm">
              <Row label="Fabric" value={job.fabricName ?? "—"} />
              <Row label="Yardage" value={job.yardageMetres ? formatMetres(job.yardageMetres) : "—"} />
            </dl>
          </div>
        </Section>

        <div className="space-y-6">
          <Section title="Design">
            {job.options.length === 0 ? (
              <p className="text-sm text-muted">The template&apos;s standard design, no options chosen.</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {job.options.map((o) => (
                  <li key={o.group} className="rounded-xl bg-cream/70 px-3 py-2 text-sm">
                    <span className="block text-xs text-muted">{o.group_label}</span>
                    <span className="font-semibold text-ink">{o.label}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={job.approvedAt ? "Approved measurements" : "Customer's measurements"}>
            <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              {Object.entries(job.measurements).map(([key, value]) => (
                <div key={key} className={`rounded-xl px-3 py-2 ${corrected.includes(key) ? "bg-warning-soft" : "bg-cream/70"}`}>
                  <dt className="text-xs text-muted">{measurementLabel(key, fields)}</dt>
                  <dd className="font-bold text-ink">
                    {value} cm
                    {corrected.includes(key) && (
                      <span className="ml-1 text-xs font-semibold text-warning">(was {job.confirmedMeasurements[key]})</span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs leading-5 text-muted">
              {job.approvedAt
                ? `Approved for cutting on ${formatWhen(job.approvedAt)}.${corrected.length ? " Highlighted values were corrected from the customer's set." : ""}`
                : "Confirmed by the customer (or their agent). Check them before cutting — nothing can be cut until they're approved."}
            </p>
          </Section>

          {job.events.length > 0 && (
            <Section title="Workshop history">
              <ol className="space-y-2 text-sm">
                {job.events.map((e) => (
                  <li key={`${e.toStage}-${e.at}`} className="flex flex-wrap justify-between gap-x-3">
                    <span>
                      <span className="font-semibold text-ink">{stageLabel(e.toStage)}</span>
                      {e.byMe && <span className="text-muted"> · by you</span>}
                      {e.reason && <span className="block text-xs text-muted">“{e.reason}”</span>}
                    </span>
                    <time dateTime={e.at} className="text-muted">
                      {formatWhen(e.at)}
                    </time>
                  </li>
                ))}
              </ol>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-line bg-white p-5 shadow-card sm:p-6 print:mb-4 print:break-inside-avoid print:shadow-none">
      <h2 className="font-display text-xl text-ink">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-bold text-ink">{value}</dd>
    </div>
  );
}
