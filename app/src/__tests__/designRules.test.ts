/// <reference types="node" />
import fs from 'fs';
import path from 'path';

/**
 * As regras de design que o tsc não vê, como teste: quem violar, quebra a
 * suíte que roda antes de todo PR. Sem ESLint no projeto, é aqui que a
 * regressão é barrada.
 */
const RAIZ = path.join(__dirname, '..');
function arquivos(dir: string, out: string[] = []): string[] {
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n);
    if (fs.statSync(p).isDirectory()) {
      if (!p.includes('__tests__')) arquivos(p, out);
    } else if (/\.tsx?$/.test(n)) out.push(p);
  }
  return out;
}
const rel = (p: string) => path.relative(RAIZ, p);
/** Onde `fontSize` e `Text` cru são legítimos, e por quê. */
const EXCECOES_FONTE: Record<string, string> = {
  'components/ui/Type.tsx': 'é a própria escala',
  'components/AppIcon.tsx': 'letra do ícone de app, tamanho proporcional ao quadrado',
  'screens/GattScreen.tsx': 'dump hexadecimal em monoespaçada',
  'components/Logo.tsx': 'marca em SVG',
  'screens/SportScreen.tsx': 'cronômetro da sessão: 56 com GPS (cabe o mapa) e 72 sem; entre Metric e Display',
};
const todos = arquivos(path.join(RAIZ, 'screens')).concat(arquivos(path.join(RAIZ, 'components')));
/** Gráficos desenham texto em SVG (`react-native-svg`), onde fontSize é atributo do SVG. */
const usaSvgText = (s: string) => /from 'react-native-svg'/.test(s);

describe('regras de design', () => {
  it('fontSize só existe na escala (Type.tsx) ou em exceção justificada', () => {
    const infratores = todos
      .filter((p) => {
        const s = fs.readFileSync(p, 'utf8');
        if (EXCECOES_FONTE[rel(p)] || usaSvgText(s)) return false;
        // Atributo JSX. `fontSize:` dentro de style de TextInput é do campo, não da escala.
        return /\bfontSize=\{/.test(s);
      })
      .map(rel);
    expect(infratores).toEqual([]);
  });

  it('tela não importa Text cru do Tamagui: usa a escala', () => {
    const infratores = todos
      .filter((p) => {
        const s = fs.readFileSync(p, 'utf8');
        if (rel(p).startsWith('components/ui/') || EXCECOES_FONTE[rel(p)]) return false;
        return /import \{[^}]*\bText\b[^}]*\} from '@tamagui\/core'/.test(s);
      })
      .map(rel);
    expect(infratores).toEqual([]);
  });

  it('nenhum texto de tela usa travessão', () => {
    const infratores = todos
      .concat(arquivos(path.join(RAIZ, 'domain')))
      .filter((p) => {
        const s = fs
          .readFileSync(p, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
        return s.includes('—');
      })
      .map(rel);
    expect(infratores).toEqual([]);
  });
});
