import { createContext, useContext, type ReactNode } from "react";

/**
 * Versão do visual. `novo`: cursor do mouse clicando nas telas e legenda que acende palavra por palavra.
 * Sem `novo`: o visual clássico (toque com círculo e legenda por frase). As duas usam a mesma narração.
 */
export type Estilo = { novo: boolean };

const Ctx = createContext<Estilo>({ novo: false });

export function EstiloProvider({ novo, children }: Estilo & { children: ReactNode }) {
  return <Ctx.Provider value={{ novo }}>{children}</Ctx.Provider>;
}

export const useEstilo = () => useContext(Ctx);
