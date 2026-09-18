# Redações, professores e captura: estado e próximas entregas

## Implementado nesta etapa

- Catálogo estruturado de temas da aplicação regular do ENEM de 2011 a 2025, com ano, origem e ligação para a proposta ou página oficial do Inep. Os textos motivadores permanecem no PDF oficial; o produto guarda só o título da proposta.
- Cadastro de professor com uma matéria declarada. Questões autorais criadas por essa conta ficam no workspace pessoal, limitadas à matéria escolhida e marcadas como conteúdo de parceiro, sem se passarem por itens oficiais. O cadastro não concede acesso à publicação no banco central.
- Professores de Língua Portuguesa, Literatura e Redação podem criar temas autorais pessoais. Exposição desses temas aos alunos depende de revisão editorial e de um vínculo institucional.
- Banco de questões com filtros de prova, ano, número e texto do enunciado. Para questões importadas do PDF do ENEM, a página de origem é registrada quando detectável e exibida como ligação para o documento oficial.

## Preparação para recorte de PDFs e scanner

O pipeline de importação já distingue questões reconhecidas e ignoradas, grava a origem e marca recortes de imagem como pendentes de revisão. A página do PDF é um localizador para o revisor; ela ainda não é um recorte visual. A próxima entrega deve renderizar a página, escolher a área da questão, guardar coordenadas normalizadas e permitir ajuste manual. Questões com gráfico, mapa ou alternativa visual não devem ser publicadas apenas com texto extraído.

O scanner de redação e de cartão-resposta deve usar uma esteira de captura com arquivo original protegido, páginas ordenadas, recorte e perspectiva, OCR/leitura de marcações, confiança por campo, correção manual, estado de processamento e trilha de revisão. A redação digitada e a transcrita podem então alimentar o mesmo relatório por competência, sem atribuir nota definitiva quando a leitura estiver ambígua.

## Funcionalidades a implementar em seguida

1. Revisão editorial de temas e questões de professores, com aprovação para turma ou banco central.
2. Vínculo de professor a instituição, turmas e disciplinas verificadas; convite, papéis e gestão de membros.
3. Renderização e recorte manual das páginas do PDF, extração de imagens e alternativas visuais, prévia antes da importação e relatório de itens ignorados.
4. Captura de redações por câmera/arquivo, correção de perspectiva, múltiplas páginas e OCR revisável.
5. Correção de redação por cinco competências do ENEM, justificativas e revisão humana.
6. Simulados/listas e cartão-resposta com alinhamento, leitura das marcas e confirmação das ambíguas.
7. Analytics do aluno e professor, relatórios por turma e recomendações baseadas no histórico.
