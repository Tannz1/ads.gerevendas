import type { Metadata } from "next";
import { LEGAL_ENTITY as L, LegalPage } from "@/components/marketing/legal-page";

export const metadata: Metadata = { title: "Política de Privacidade" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Política de Privacidade">
      <p>
        Esta política explica como o GereVendas Ads trata dados pessoais, conforme a Lei Geral de Proteção de Dados (Lei
        13.709/2018). O controlador é {L.name}, CNPJ {L.cnpj}, {L.address}.
      </p>

      <h2>Dados que tratamos</h2>
      <ul>
        <li>Conta: nome, e-mail e papel na empresa.</li>
        <li>
          Negócio: o que você informa no cadastro (produtos, preços, público, região, contatos comerciais), logotipo e
          fotos enviadas.
        </li>
        <li>Vídeo com avatar, se você usar: a foto do rosto e o roteiro enviados, com o consentimento registrado.</li>
        <li>
          Meta: identificadores da conta de anúncios, Página e Instagram compartilhados, campanhas e métricas de
          resultado.
        </li>
        <li>Uso: registros de acesso e de auditoria das ações feitas na plataforma.</li>
      </ul>

      <h2>Para que usamos</h2>
      <ul>
        <li>Criar sua conta e dar acesso à sua equipe.</li>
        <li>Gerar propostas de estratégia, textos, imagens e vídeos de anúncio a partir do que você informou.</li>
        <li>Criar e acompanhar campanhas na Meta, sempre com sua confirmação antes de qualquer gasto.</li>
        <li>Cobrar a assinatura, prestar suporte e manter a segurança da plataforma.</li>
      </ul>
      <p>
        As bases legais são a execução do contrato, o cumprimento de obrigação legal, o legítimo interesse em segurança
        e o seu consentimento, que pode ser revogado a qualquer momento em Conta.
      </p>

      <h2>Com quem compartilhamos</h2>
      <p>Somente com os fornecedores necessários para o serviço funcionar:</p>
      <ul>
        <li>OpenAI: geração de textos e imagens.</li>
        <li>ElevenLabs: narração e vídeo com avatar.</li>
        <li>Meta Platforms: criação e acompanhamento das campanhas.</li>
        <li>Provedor de e-mail: envio dos links de acesso.</li>
        <li>Provedor de hospedagem: armazenamento da aplicação e do banco de dados.</li>
      </ul>
      <p>
        Alguns desses fornecedores processam dados fora do Brasil. Nesses casos a transferência segue o artigo 33 da
        LGPD. Não vendemos dados pessoais.
      </p>

      <h2>Por quanto tempo guardamos</h2>
      <p>
        Enquanto sua conta existir. Ao excluir a empresa em Conta, os dados dela são apagados, exceto o que a lei
        obrigar a manter.
      </p>

      <h2>Seus direitos</h2>
      <p>
        Você pode confirmar, acessar, corrigir, exportar e excluir seus dados, e revogar consentimentos. A exportação e
        a exclusão estão disponíveis em Conta. Para os demais pedidos, fale com o encarregado de dados: {L.dpoName},{" "}
        {L.dpoEmail}.
      </p>

      <h2>Cookies</h2>
      <p>Usamos apenas cookies necessários para manter você conectado. Não usamos cookies de publicidade.</p>

      <h2>Segurança</h2>
      <p>
        Cada empresa só acessa os próprios dados. Chaves de integração ficam apenas no servidor e as ações sensíveis são
        registradas em auditoria.
      </p>

      <h2>Contato</h2>
      <p>Dúvidas sobre esta política: {L.contactEmail}.</p>
    </LegalPage>
  );
}
