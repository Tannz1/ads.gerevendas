-- Conta de anúncios compartilhada (ADR 0009). Com META_SHARED_AD_ACCOUNT_ID configurada, todas as
-- empresas anunciam na mesma conta da BM da GereVendas. O cliente só compartilha Página e Instagram:
-- não entra na BM nem cadastra pagamento na Meta, porque paga a verba de mídia à GereVendas.

alter table public.meta_connections
  add column shared_account boolean not null default false;

-- Conectada = conta + Página; na conta própria do estoque também exige convite aceito e pagamento
-- verificado na Meta (ADR 0005).
create or replace function private.meta_refresh_status(p_org uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.meta_connections m
     set status = s.next_status,
         billing_verified_on_meta = (m.billing_status = 'verified'),
         connected_at = case when s.next_status = 'connected' and m.status <> 'connected' then now() else m.connected_at end
    from (
      select c.organization_id,
             (case when c.ad_account_status = 'done' and c.ad_account_id is not null
                        and c.page_access_status = 'done' and c.page_id is not null
                        and (c.shared_account
                             or (c.client_invite_status = 'accepted' and c.billing_status = 'verified'))
                   then 'connected' else 'disconnected' end)::public.meta_connection_status as next_status
        from public.meta_connections c
       where c.organization_id = p_org
    ) s
   where m.organization_id = s.organization_id;
end;
$$;
revoke all on function private.meta_refresh_status(uuid) from public;

-- Vincula a empresa à conta compartilhada. Só o servidor (service role) chama: o ID da conta vem da
-- configuração, nunca do navegador.
create function public.meta_assign_shared_account(
  p_org uuid,
  p_ad_account_id text,
  p_name text,
  p_simulated boolean,
  p_actor uuid,
  p_correlation_id text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_ad_account_id is null or p_ad_account_id !~ '^act_[0-9A-Za-z_]{3,60}$' then
    raise exception 'invalid_ad_account' using errcode = '22023';
  end if;

  insert into public.meta_connections (
    organization_id, simulated, ad_account_id, ad_account_name, ad_account_status, pool_requested_at,
    connected_by, shared_account
  ) values (p_org, p_simulated, p_ad_account_id, left(p_name, 120), 'done', null, p_actor, true)
  on conflict (organization_id) do update set
    simulated = excluded.simulated,
    ad_account_id = excluded.ad_account_id,
    ad_account_name = excluded.ad_account_name,
    ad_account_status = 'done',
    pool_requested_at = null,
    shared_account = true,
    connected_by = coalesce(public.meta_connections.connected_by, excluded.connected_by);

  perform private.meta_audit(p_org, 'meta.shared_account_assigned', p_correlation_id,
    jsonb_build_object('ad_account_id', p_ad_account_id, 'simulated', p_simulated));
  perform private.meta_refresh_status(p_org);
end;
$$;
revoke all on function public.meta_assign_shared_account(uuid, text, text, boolean, uuid, text)
  from public, anon, authenticated;
grant execute on function public.meta_assign_shared_account(uuid, text, text, boolean, uuid, text) to service_role;
