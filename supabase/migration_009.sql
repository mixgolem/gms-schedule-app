alter table shift_leave_usage drop constraint if exists shift_leave_usage_usage_type_check;

alter table shift_leave_usage
  add constraint shift_leave_usage_usage_type_check
  check (usage_type in ('annual', 'personal_leave', 'other'));
