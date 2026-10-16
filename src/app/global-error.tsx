"use client";

// Último recurso: substitui o layout raiz quando ele próprio falha. Sem dependências do app.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: "system-ui, sans-serif", textAlign: "center", padding: "20vh 24px" }}>
        <h1>Algo deu errado</h1>
        <p>O GereVendas Ads está com instabilidade. Tente de novo em instantes.</p>
        {error.digest && <p style={{ color: "#6b6b6b" }}>Código para o suporte: {error.digest}</p>}
        <button onClick={reset} style={{ marginTop: 16, padding: "10px 20px", fontSize: 16 }}>
          Tentar de novo
        </button>
      </body>
    </html>
  );
}
