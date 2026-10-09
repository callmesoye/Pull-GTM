-- Adds a user-selected end channel to existing owner-scoped workflows.
-- This is planning metadata; it never grants publishing or messaging access.
begin;
alter table public.pull_automations add column if not exists destination text not null default 'none';
do $$ begin
  if not exists (select 1 from pg_constraint where conname='pull_automations_destination_check') then
    alter table public.pull_automations add constraint pull_automations_destination_check
      check (destination in ('none','linkedin','instagram','facebook','x','jiji','shopify','whatsapp','email','other'));
  end if;
end $$;
grant insert (destination), update (destination) on public.pull_automations to authenticated;
comment on column public.pull_automations.destination is 'Requested handoff channel; no provider connection or sending is implied.';
commit;
