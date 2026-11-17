import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { getCurrentProfile } from "@multife/backend/modules/users/getActor";
import { DispatchQueue } from "@/components/production/dispatch-queue";
import { HeadingRule } from "@/components/ui/heading";
import { formatOrderDate, todayInPakistan } from "@/lib/order-status";
import { listMyJobs, type JobListItem } from "@/lib/production-jobs";
import { isJobDone, isJobOverdue, stageLabel } from "@/lib/production-stage";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My work" };

const VIEWS = [
  { key: "open", label: "To do" },
  { key: "done", label: "Done" },
] as const;

// FR-PRD-05: the signed-in tailor / QC user's own job queue; dispatch staff
// get the delivery queue instead (FR-FUL).
export default async function ProductionQueuePage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const params = await searchParams;
  const profile = await getCurrentProfile(await createClient());
  if (profile?.role === "dispatch") return <DispatchQueue view={params.view} />;

  const view = params.view === "done" ? "done" : "open";
  const jobs = await listMyJobs().catch((error: unknown) => {
    console.error("listMyJobs failed:", error instanceof Error ? error.message : "unknown error");
    return null;
  });

  const today = todayInPakistan();
  const open = (jobs ?? []).filter((j) => !isJobDone(j.stage, j.orderStatus));
  const done = (jobs ?? []).filter((j) => isJobDone(j.stage, j.orderStatus));
  const shown = view === "done" ? done : open;
  const overdue = open.filter((j) => isJobOverdue(j, today)).length;

  return (
    <div>
      <div className="max-w-2xl">
        <h1 className="font-display text-3xl leading-tight text-ink sm:text-4xl">My jobs</h1>
        <HeadingRule align="left" className="mt-4" />
        <p className="mt-4 text-base leading-7 text-muted">
          Outfits assigned to you, most urgent first. Open a job for its sheet: design, measurements and the next step.
        </p>
      </div>

      {jobs === null ? (
        <div className="mt-8">
          <Alert tone="danger">We couldn&apos;t load your jobs. Please refresh to try again.</Alert>
        </div>
      ) : (
        <>
          <div className="mt-8 flex flex-wrap items-center gap-2">
            {VIEWS.map((v) => {
              const count = v.key === "done" ? done.length : open.length;
              const active = v.key === view;
              return (
                <Link
                  key={v.key}
                  href={v.key === "open" ? "/production" : "/production?view=done"}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-bold transition-colors ${
                    active ? "border-transparent bg-mf-blue text-white shadow-blue" : "border-line bg-white text-ink hover:border-cyan-bright/60"
                  }`}
                >
                  {v.label}
                  <span className={`rounded-full px-2 py-0.5 text-xs ${active ? "bg-white/20" : "bg-cream text-muted"}`}>{count}</span>
                </Link>
              );
            })}
            {overdue > 0 && (
              <span className="rounded-full bg-danger-soft px-3 py-1.5 text-xs font-bold text-danger">
                {overdue} overdue
              </span>
            )}
          </div>

          {shown.length === 0 ? (
            <div className="mt-6 rounded-3xl border border-dashed border-line bg-white/60 px-6 py-12 text-center">
              <p className="text-base font-semibold text-ink">
                {view === "done" ? "No finished jobs yet" : "No jobs waiting for you"}
              </p>
              <p className="mt-1 text-sm text-muted">
                {view === "done" ? "Jobs you finish will be listed here." : "New jobs appear here when the admin team assigns them to you."}
              </p>
            </div>
          ) : (
            <ul className="mt-6 grid gap-3 md:grid-cols-2">
              {shown.map((job) => (
                <JobCard key={job.id} job={job} overdue={isJobOverdue(job, today)} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function JobCard({ job, overdue }: { job: JobListItem; overdue: boolean }) {
  const cancelled = job.orderStatus === "cancelled" || job.orderStatus === "failed";
  return (
    <li>
      <Link
        href={`/production/jobs/${job.id}`}
        className="flex h-full gap-4 rounded-3xl border border-line bg-white p-4 shadow-card transition-colors hover:border-cyan-bright/60"
      >
        <span className="relative flex h-20 w-20 flex-none items-center justify-center overflow-hidden rounded-2xl bg-cream">
          {job.fabricImage ? (
            <Image src={job.fabricImage} alt="" fill sizes="80px" className="object-cover" />
          ) : (
            <span aria-hidden="true" className="font-display text-2xl text-hint">
              {job.templateName.charAt(0)}
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-extrabold tracking-tight text-ink">{job.orderNumber}</span>
            {job.priority > 0 && (
              <span className="rounded-full bg-orange/15 px-2 py-0.5 text-[11px] font-bold text-orange">Urgent</span>
            )}
            {overdue && <span className="rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-bold text-danger">Overdue</span>}
          </span>
          <span className="mt-0.5 block truncate text-sm font-semibold text-ink">{job.templateName}</span>
          <span className="block truncate text-xs text-muted">{job.fabricName ?? "Fabric"}</span>
          <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span
              className={`rounded-full px-2.5 py-0.5 font-bold ${
                cancelled ? "bg-danger-soft text-danger" : "bg-cyan-bright/10 text-ocean"
              }`}
            >
              {cancelled ? "Order cancelled" : stageLabel(job.stage)}
            </span>
            {job.dueDate && <span className="text-muted">Due {formatOrderDate(job.dueDate)}</span>}
          </span>
        </span>
      </Link>
    </li>
  );
}
