drop table if exists entries;
create table entries (
  id integer primary key autoincrement,
  'run_key' text,
  timestamp integer,
  'key' text,
  'value' text
);

drop table if exists runs;
create table runs (
  'key' text,
  'start_date' text,
  'ip' text,
  'user_agent' text
);
