-- Fix: "agent_customers: agent reads own assignments" compared agent_id
-- (agents.id, a generated UUID) against auth.uid() (the profile/auth id) —
-- two different UUID spaces, so the policy never actually matched and an
-- agent could never read their own agent_customers rows. Every other
-- agent-scoping check resolves this correctly through current_agent_id()
-- (agents.profile_id = auth.uid()); this policy skipped that step.
drop policy if exists "agent_customers: agent reads own assignments" on public.agent_customers;
create policy "agent_customers: agent reads own assignments" on public.agent_customers
  for select to authenticated using (agent_id = public.current_agent_id());
