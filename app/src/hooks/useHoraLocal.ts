import { useEffect, useState } from 'react';

/**
 * A hora local, que ANDA.
 *
 * `new Date().getHours()` no corpo do componente só muda quando algo mais
 * re-renderiza: com a tela aberta das 13h50 às 14h10, o insight continuava o
 * das 13h. Pedido da fundadora (ago/2026): o parágrafo de saúde atualiza a
 * cada hora. Um relógio de um minuto é barato e basta — a hora só vira uma vez.
 */
export function useHoraLocal(): number {
  const [hora, setHora] = useState(() => new Date().getHours());
  useEffect(() => {
    const id = setInterval(() => {
      const h = new Date().getHours();
      setHora((atual) => (atual === h ? atual : h));
    }, 60_000);
    return () => clearInterval(id);
  }, []);
  return hora;
}
