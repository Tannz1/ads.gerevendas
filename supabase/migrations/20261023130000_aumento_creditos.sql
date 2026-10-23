-- GereVendas Ads — expansão de limites de geração para o piloto (100 estratégias e 200 imagens)
-- Permite ao cliente testar à vontade sem esgotar o limite mensal.

create or replace function private.credit_limit(p_resource public.credit_resource) returns integer
language sql immutable set search_path = ''
as $$ select case p_resource when 'strategy' then 100 when 'image' then 200 end $$;
