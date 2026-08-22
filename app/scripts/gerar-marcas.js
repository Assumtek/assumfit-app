/*
 Extrai de `simple-icons` (CC0) só os logotipos que a lista de avisos no pulso
 usa, para `src/assets/brandMarks.ts`. O pacote inteiro são 3 mil marcas num
 índice único, sem importação por ícone — embarcá-lo custaria megabytes por
 26 desenhos. Rode de novo ao acrescentar categoria: `node scripts/gerar-marcas.js`.
*/
const si = require('simple-icons');
const fs = require('fs');
const MARCAS = ['Qq','Wechat','Facebook','Whatsapp','X','Line','Instagram','Snapchat','Messenger','Zalo','Kakaotalk','Telegram','Viber','Signal','Zoom','Kik','Tinder','Tumblr','Discord','Googlemeet','Tiktok','Youtube','Gmail','Imessage'];
const linhas = MARCAS.map((n) => {
  const i = si['si' + n];
  if (!i) throw new Error('marca ausente em simple-icons: ' + n);
  return `  ${n.toLowerCase()}: { hex: '#${i.hex}', path: '${i.path}' },`;
});
fs.writeFileSync('src/assets/brandMarks.ts', `// GERADO por scripts/gerar-marcas.js a partir de simple-icons (CC0). Não edite à mão.
export const BRAND_MARKS = {
${linhas.join('\n')}
} as const;
export type BrandMark = keyof typeof BRAND_MARKS;
`);
console.log('ok', MARCAS.length);
