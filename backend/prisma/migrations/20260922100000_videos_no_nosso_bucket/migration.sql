-- Os vídeos do catálogo passam a viver no nosso bucket.
--
-- As URLs apontavam para cdn-homol.muvx.app, o CDN de homologação de outro
-- produto. O que fica no banco agora é a CHAVE; quem assina a URL é o
-- servidor, na hora de entregar.
--
-- As colunas antigas continuam por um ciclo: o app de quem ainda não atualizou
-- lê `video_url`, e tirá-las agora deixaria essa gente sem vídeo nenhum.
ALTER TABLE "exercises" ADD COLUMN "video_key" TEXT;
ALTER TABLE "exercises" ADD COLUMN "thumb_key" TEXT;
