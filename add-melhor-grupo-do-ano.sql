-- MS TikTok PALOP Awards 2026
-- Add category: Melhor Grupo do Ano
-- Safe to run more than once in Supabase SQL Editor.

with new_category as (
  insert into public.categories (title, display_order, is_active)
  values ('Melhor Grupo do Ano', 9, true)
  on conflict (title) do update
    set display_order = excluded.display_order,
        is_active = true
  returning id
)
insert into public.nominees (category_id, name, display_order, is_active)
select c.id, n.name, n.display_order, true
from new_category c
cross join (values
  ('Os Diamond', 1),
  ('Os Safados', 2),
  ('Família Strong', 3),
  ('Família do Comentador', 4),
  ('Os Infantis', 5)
) as n(name, display_order)
on conflict (category_id, name) do update
  set display_order = excluded.display_order,
      is_active = true;
