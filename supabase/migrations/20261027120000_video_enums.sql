-- GereVendas Ads — vídeo com avatar (ADR 0008), parte 1: novos valores de enum.
-- Separado da parte 2 porque um valor novo de enum só pode ser usado depois do commit.

alter type public.generation_kind add value if not exists 'video';
alter type public.credit_resource add value if not exists 'video';
