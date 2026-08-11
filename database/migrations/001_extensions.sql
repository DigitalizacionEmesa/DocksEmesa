-- UUID generation
create extension if not exists "pgcrypto";

-- Needed for preventing overlapping bookings
create extension if not exists "btree_gist";