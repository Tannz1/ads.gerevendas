# Criativos — Subprojeto 2 (Imagem-base) Implementation Plan

> Execução inline. Spec: `docs/superpowers/specs/2026-10-17-criativos-design.md` (Subprojeto 2).

**Goal:** cada peça pode ter imagem de fundo: foto do cliente (com declaração de direito de uso) ou imagem
gerada pela OpenAI Images, sem texto; trocar a imagem não mexe no texto.

**Contrato OpenAI verificado na documentação oficial (17/10/2026):** `POST /v1/images/generations`,
`model` (`gpt-image-2.5-flare` | `gpt-image-2.5-sunburst`), `size` `1024x1536`, `quality`
(`low|medium|high|xhigh|max|auto`), `output_format` `jpeg`, `output_compression` 0–100,
`safety_identifier`; resposta `data[0].b64_json`.

## Global Constraints
- Imagem gerada nunca contém texto, preço, logotipo ou marca d'água (prompt + o texto é sempre camada HTML).
- Fotos: só JPEG/PNG, até 5 MB, tipo conferido pelos bytes (não pelo nome); declaração de direito obrigatória.
- Bucket privado `creative-assets`, caminho `{organization_id}/{asset_id}.{jpg|png}`, RLS por pasta.
- Sem chave de imagem: "Gerar imagem" desabilitado com explicação (não há imagem simulada).
- Sem service role; sessão do usuário + RLS.

## Review Focus
- Arquivo `.png` que na verdade é PDF/HTML → recusado (bytes).
- Usuário de outra empresa tenta ler o arquivo no Storage pelo caminho → negado.
- Peça aprovada recebe imagem nova → volta a rascunho.
- Dois cliques em "Gerar imagem" na mesma peça → um job.
- Imagem clara atrás de texto branco → overlay da cor de fundo mantém leitura.

## Tasks
1. Migration `20261017130000_imagens.sql` + RLS tests `30_imagens_rls.test.sql`: `assets`, `creatives.image_asset_id`,
   índices de job por tipo, RPCs `start_image_job`, `finish_image_job`, `register_photo`; bucket + policies
   (só quando o schema `storage` existe).
2. `src/server/ai/{openai-image,image-prompt}.ts`, `src/lib/image-bytes.ts` + testes unitários.
3. Actions `uploadPhoto`, `generateImage`, `removeImage`, `runImageJob`; loaders com URL assinada / bytes.
4. Template com imagem + overlay; editor com seção "Imagem de fundo"; `bodySizeLimit` 6 MB.
5. E2E real: enviar foto (PNG gerado no teste), PNG final com imagem, outra empresa sem acesso; STATUS.
