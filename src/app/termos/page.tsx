import type { Metadata } from "next";
import { LEGAL_ENTITY as L, LegalPage } from "@/components/marketing/legal-page";

export const metadata: Metadata = { title: "Termos de Uso" };

export default function TermsPage() {
  return (
    <LegalPage title="Termos de Uso">
      <p>
        Estes termos regem o uso do GereVendas Ads, oferecido por {L.name}, CNPJ {L.cnpj}. Ao criar uma conta você
        concorda com eles e com a Política de Privacidade.
      </p>

      <h2>O serviço</h2>
      <p>
        O GereVendas Ads ajuda negócios locais a criar anúncios estáticos e em vídeo e a publicá-los na Meta (Facebook e
        Instagram). A inteligência artificial gera propostas a partir do que você informa. Você revisa e aprova tudo
        antes da publicação.
      </p>

      <h2>Sua responsabilidade pelo conteúdo</h2>
      <ul>
        <li>As informações do negócio, preços, ofertas e depoimentos usados nos anúncios devem ser verdadeiros.</li>
        <li>Você precisa ter direito de uso sobre fotos, logotipos e imagens de pessoas que enviar.</li>
        <li>Os anúncios devem seguir a lei e os Padrões de Publicidade da Meta.</li>
      </ul>

      <h2>Publicação e gasto com mídia</h2>
      <ul>
        <li>Toda campanha é criada pausada. Ela só vai ao ar quando você confirmar o valor por dia.</li>
        <li>
          O gasto com anúncios é cobrado diretamente pela Meta, na forma de pagamento cadastrada na conta de anúncios. O
          GereVendas Ads não recebe nem repassa esse valor.
        </li>
        <li>
          A Meta revisa os anúncios e pode recusá-los ou restringi-los. Não garantimos aprovação, alcance nem
          resultados.
        </li>
      </ul>

      <h2>Assinatura</h2>
      <p>
        A assinatura do software é cobrada à parte do gasto com mídia, no valor e na periodicidade exibidos em
        Assinatura. Ela inclui um limite mensal de gerações, informado na mesma tela.
      </p>

      <h2>Uso proibido</h2>
      <p>
        É proibido usar a plataforma para conteúdo enganoso, ilegal ou discriminatório, tentar acessar dados de outras
        empresas ou contornar os limites de uso.
      </p>

      <h2>Encerramento</h2>
      <p>
        Você pode exportar seus dados e excluir a empresa a qualquer momento em Conta. Podemos suspender contas que
        violem estes termos.
      </p>

      <h2>Alterações e foro</h2>
      <p>
        Avisaremos sobre mudanças relevantes nestes termos antes de entrarem em vigor. Fica eleito o foro da comarca de{" "}
        {L.forum}. Contato: {L.contactEmail}.
      </p>
    </LegalPage>
  );
}
