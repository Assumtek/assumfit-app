import { createNavigationContainerRef } from '@react-navigation/native';

/** Rotas do stack raiz. Sem parâmetros por enquanto — tudo vem das stores. */
export type RootParamList = {
  Connect: undefined;
  Main: undefined;
  Hrv: undefined;
  Sleep: undefined;
  Oxygen: undefined;
  Temperature: undefined;
  Pressure: undefined;
  Stress: undefined;
  Activity: undefined;
  BioAge: undefined;
  Device: undefined;
};

/**
 * A sidebar é um overlay fora da árvore de navegação, então não tem acesso aos
 * hooks de navegação. Ela navega por esta ref.
 */
export const navigationRef = createNavigationContainerRef<RootParamList>();

/**
 * As cinco raízes moram no navigator de abas. Este funil traduz o nome legado
 * ('Main', 'Sport'…) para `Tabs → aba` — e é por ele que notificação antiga
 * agendada no aparelho, sidebar e Avisos continuam navegando sem saber que a
 * arquitetura mudou.
 */
const NAS_ABAS = new Set(['Main', 'Health', 'Sport', 'Meals', 'Focus']);

export function navigate(route: keyof RootParamList | string) {
  if (!navigationRef.isReady()) return;
  if (NAS_ABAS.has(route as string)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (navigationRef as any).navigate('Tabs', { screen: route });
    return;
  }
  navigationRef.navigate(route as keyof RootParamList);
}
