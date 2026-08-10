create table if not exists shift_type_defaults (
  shift_type text primary key check (shift_type in ('dawn', 'day', 'night')),
  start_time time not null,
  end_time time not null
);

insert into shift_type_defaults (shift_type, start_time, end_time) values
  ('dawn', '06:30', '15:30'),
  ('day', '09:00', '18:00'),
  ('night', '15:00', '00:00')
on conflict (shift_type) do nothing;

alter table shift_type_defaults enable row level security;

create policy "shift_type_defaults_select_all" on shift_type_defaults
  for select using (true);

create policy "shift_type_defaults_write_authenticated" on shift_type_defaults
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

alter publication supabase_realtime add table shift_type_defaults;
