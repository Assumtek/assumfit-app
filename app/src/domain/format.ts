/** Formatação de tempo compartilhada por domínio e tela. Mora aqui para `ratings` e `workout` não se importarem mutuamente. */
/** `4500` → `1h15`. Minuto solto quando é menos de uma hora. */
export function formatDuration(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h${String(minutes).padStart(2, '0')}`;
}
