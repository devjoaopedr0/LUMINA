# Lumina Marketplace — mercado educacional

> **Status: FUTURO (Fase 4 do roadmap).** Nada deste documento está implementado e ele **não entra no MVP atual**. Descreve a visão funcional, as regras de negócio e uma proposta de arquitetura para quando a frente for priorizada. Ver [ROADMAP_ECOSSISTEMA.md](ROADMAP_ECOSSISTEMA.md).

## 1. Objetivo

Professores, especialistas, produtores de conteúdo e instituições vendem **cursos, aulas, mentorias e materiais** dentro da Lumina. O aluno descobre, compra, consome e avalia sem sair do app. O conteúdo comprado se integra ao que o aluno já faz: cronograma, caderno de erros e recomendações da LuminIA.

A Lumina fica com uma comissão por venda. É a terceira fonte de receita, ao lado das assinaturas individuais e institucionais.

## 2. Vendedores

### 2.1 Tipos
- **Professor individual** (com ou sem vínculo institucional).
- **Produtor de conteúdo** (não necessariamente professor).
- **Instituição** (cursinho ou escola vendendo para o público, separado da assinatura institucional).

### 2.2 Perfil de vendedor
- **Apresentação:** nome, foto, biografia, apresentação profissional, áreas de atuação, disciplinas, formação e qualificações informadas, experiência.
- **Números:** cursos publicados, avaliações, número de alunos e indicadores comerciais (no painel do próprio vendedor).
- **Selos:** "qualificação verificada" só quando houver documento conferido. O que é só informado aparece como **informado pelo professor**.

### 2.3 Cadastro e verificação
1. A conta existente pede "quero vender". **Não se cria outra conta.**
2. Dados fiscais e bancários vão para o **provedor de pagamentos** (subconta/recebedor), não para a Lumina.
3. Verificação de identidade (KYC) feita pelo provedor; aceite dos termos do vendedor.
4. Revisão do primeiro produto pela moderação antes de publicar.

### 2.4 Identidade única (regra obrigatória)
O professor institucional que também vende tem **uma conta só**. "Vendedor" é um vínculo adicional (`InstructorProfile` ligado ao `User`), não um `AccountType` novo nem uma conta separada. `AccountType` continua dizendo o papel principal (aluno, professor, coordenação…). A capacidade de vender é a existência do perfil de vendedor aprovado.

O `TeacherProfile` que já existe (só `subject`) é o perfil **institucional** do professor e continua como está. O `InstructorProfile` é o perfil **comercial**.

## 3. Produtos
| Tipo | Exemplos | Entrega |
| --- | --- | --- |
| Curso completo | Matemática do zero, Física para o ENEM, Química orgânica | Módulos, aulas em vídeo, materiais e atividades |
| Aula avulsa | Gravada, ao vivo, particular, resolução de questões | Vídeo ou agendamento |
| Pacote de aulas | Particulares, revisão, preparação para prova | Créditos de aula com agenda |
| Mentoria | Individual, em grupo, orientação para vestibular | Sessões agendadas e acompanhamento |
| Material digital | Apostilas, e-books, mapas mentais, resumos, listas | Arquivo para ler no app ou baixar, se autorizado |
| Produto Lumina | Simulado exclusivo, banco de questões autoral, plano de estudo, oficina | Reaproveita `Simulation`, `Question` e o cronograma |

"Produtos Lumina" são o que diferencia a plataforma: um simulado autoral comprado vira um `Simulation` de verdade, com correção, domínio por tópico e cartão-resposta. Um banco de questões autoral entra no banco de questões do aluno com a origem marcada (`Question.sourceType`/`sourceName` já existem).

## 4. Criação e gestão de cursos (vendedor)
- **Conteúdo:** título, descrição, disciplina, categoria, nível, pré-requisitos; módulos com aulas (vídeo, texto, PDF), materiais e atividades (questões e simulados).
- **Preço:** preço, descontos e cupons.
- **Publicação:** rascunho → revisão → publicado; despublicar não tira o acesso de quem já comprou.
- **Acompanhamento:** inscrições, progresso dos alunos, avaliações e respostas, atualização de conteúdo com versão.

**Vídeo e proteção de conteúdo:**
- **Hospedagem:** em provedor de streaming (HLS com URLs assinadas e de curta duração), nunca arquivo direto no servidor da Lumina.
- **Marcação:** marca d'água com o e-mail do aluno.
- **Abuso:** limite de dispositivos e sessões simultâneas por compra, e detecção de compartilhamento de conta.
- **PDFs:** visualizador no app; download só quando o vendedor autorizar, com marca d'água.

## 5. Descoberta
- Catálogo e página do produto: descrição, professor, conteúdo programático, preço, avaliações, modalidade, carga horária e política de reembolso.
- Busca por nome, professor, disciplina e tema; filtros por preço, modalidade, avaliação e popularidade.
- Vitrines (destaques, mais vendidos, novidades) e recomendações personalizadas (ver §9).

## 6. Compra e matrícula
1. O aluno escolhe o produto e vê os detalhes.
2. Paga no **checkout do provedor**. Cartão, Pix e boleto são tratados pelo provedor, e **a Lumina nunca armazena dados de cartão**.
3. Webhook confirmado (idempotente) → pedido pago → matrícula criada → o produto aparece na biblioteca.

Também: histórico de compras e pagamentos, comprovantes, cupons, promoções, pedido de reembolso e gestão de matrículas.

**Regras de consumo:**
- **Arrependimento:** 7 dias para compra fora do estabelecimento (CDC, art. 49). Definir com o jurídico como fica o reembolso de curso já consumido.
- **Estornos:** chargeback e estorno revogam o acesso.
- **Menores:** compra exige responsável (ver [ROADMAP_ECOSSISTEMA.md §6](ROADMAP_ECOSSISTEMA.md)).

## 7. Área do aluno (biblioteca)
Cursos comprados; continuar de onde parou; progresso; marcar aula como concluída; baixar materiais autorizados; histórico; avaliar o curso; favoritar curso e professor. As atividades do curso podem virar tarefas do cronograma, e os erros das atividades entram no caderno de erros, como já acontece com as questões da plataforma.

## 8. Painel do vendedor e financeiro
- **Indicadores:** vendas, receita bruta, receita líquida (após comissão e taxa do provedor), alunos, cursos publicados e em rascunho, avaliação média, taxa de conclusão, mais vendidos e evolução.
- **Ferramentas:** cursos, aulas, alunos, cupons, promoções, relatórios, suporte, financeiro e pedidos de saque.
- **Saldos:** disponível, pendente (dentro do prazo de reembolso e de liquidação) e histórico de repasses.

### 8.1 Comissão e pagamentos
- **Comissão:** hipótese inicial de **10% a 20%** por venda, **a validar comercialmente**. Não é decisão final. Pode variar por categoria (ex.: mentoria × material digital) e por campanha.
- **Split:** provedor com split nativo (subcontas/recebedores), para o repasse ao vendedor não passar pelo caixa da Lumina, o que simplifica a parte regulatória. Candidatos a avaliar: Mercado Pago (já citado no item 55), Pagar.me, Stripe Connect (Pix no Brasil limitado; verificar), Asaas, Iugu.
- **Critérios de escolha:** taxas, prazo de liquidação, Pix, estorno e chargeback, KYC do vendedor, nota fiscal, conciliação (relatórios e API) e webhooks.
- **Na Lumina:** pedidos, status, matrículas, cálculo da comissão e espelho dos repasses para conciliação. Dados de cartão e bancários ficam no provedor.

## 9. Avaliações, reputação e moderação
- **Avaliação:** só quem comprou avalia (selo "compra verificada"), com nota e comentário. O vendedor responde publicamente.
- **Denúncia:** de conteúdo inadequado, propaganda enganosa ou produto com problema.
- **Contra avaliação falsa:** limite por conta, detecção de padrão (muitas avaliações da mesma rede ou de contas novas) e moderação manual quando há denúncia. O vendedor não avalia o próprio produto.
- **Moderação:** papel de **moderador** na administração da plataforma (item 56 de `FUNCIONALIDADES_GERAIS.txt`).

## 10. Proposta técnica

### 10.1 Entidades sugeridas (não criar agora)
| Entidade | Papel | Reaproveitamento / observação |
| --- | --- | --- |
| `InstructorProfile` | Perfil comercial (bio, áreas, verificação, id do recebedor no provedor) | 1:1 com `User`; convive com `TeacherProfile` |
| `MarketplaceProduct` | Produto genérico: tipo, título, preço, status, vendedor | Base comum de curso, aula, mentoria e material |
| `Course` / `CourseModule` / `CourseLesson` / `CourseMaterial` | Estrutura do curso | Atividades apontam para `Question`/`Simulation` existentes |
| `CourseEnrollment` | Acesso do aluno ao produto (origem: compra, cortesia, instituição) | Fonte da verdade do acesso |
| `CourseProgress` | Progresso por aula | Pode alimentar `TopicMastery` quando a aula tem tópico |
| `MarketplaceOrder` / `MarketplacePayment` | Pedido e pagamento (espelho do provedor, idempotente por id externo) | Sem dado de cartão |
| `CoursePurchase` | Desnecessário se `Order` + `Enrollment` cobrirem; avaliar antes de criar | Evita duplicar |
| `InstructorPayout` | Espelho dos repasses e saques | Conciliação |
| `CourseReview` | Avaliação com selo de compra verificada | Moderação |
| `CourseCoupon` | Cupons e promoções | Regras de uso e validade |

**Reaproveitamento:** `User`, `UserProfile` (foto, bio), autenticação, `Subject`/`Topic` (classificação), `Question`/`Simulation` (atividades e produtos Lumina), `AiService` (recomendações), `StudyTask` (aula vira tarefa), `ErrorNotebookEntry`.

### 10.2 Permissões
- **Vendedor:** existência de `InstructorProfile` aprovado, conferida no serviço. Vale para qualquer `AccountType`.
- **Aluno:** compra (menor só com responsável).
- **Instituição:** pode comprar licenças em lote para as turmas (matrícula com origem "instituição").
- **ADMIN e moderador:** aprovar vendedor e produto, julgar denúncias, ver o financeiro agregado.

## 11. Recomendações da LuminIA
A LuminIA pode sugerir curso, aula, mentoria ou material ligados às dificuldades reais do aluno (domínio baixo em `TopicMastery`, erros no caderno). Regras:
- a ordem é sempre **revisar → praticar → estudar em grupo → conteúdo pago**: o pago é opção, nunca a primeira resposta;
- **transparência:** a tela mostra por que recomendou (ex.: "domínio de 32% em Funções") e marca o que é produto pago;
- **neutralidade:** a recomendação **não** considera a comissão nem a margem da Lumina. Produto patrocinado, se um dia existir, aparece separado e rotulado como anúncio.

## 12. Fases
1. Perfil de vendedor e verificação (provedor).
2. Publicação de curso (vídeo, PDF, módulos) com revisão.
3. Catálogo, página do produto e busca.
4. Checkout, webhook, matrícula e biblioteca.
5. Comissão, split, saldos e repasses; painel financeiro.
6. Avaliações, denúncias e moderação.
7. Cupons, promoções, mentorias e aulas ao vivo; integração com a LuminIA.

## 13. Dúvidas em aberto
- Provedor de pagamentos e modelo de split.
- Percentual de comissão e variações por categoria.
- Provedor de vídeo e nível de proteção (DRM ou não).
- Política de reembolso de curso consumido; emissão de nota fiscal (de quem e como).
- Idade mínima para comprar e fluxo do responsável.
- Curadoria: aberto a qualquer professor verificado ou só por convite no início.
