/**
 * Termos de Uso e Política de Privacidade (LGPD).
 *
 * CURRENT_TERMS_VERSION precisa bater com lumina-backend/src/common/legal.ts.
 * Mudou o texto de forma relevante: troque a data nos dois lugares e todo
 * usuário volta a ver a tela de aceite no próximo acesso.
 *
 * ATENÇÃO: os campos de LEGAL_ENTITY são dados reais da empresa (razão social,
 * CNPJ, endereço, e-mail do encarregado) — preencha antes de publicar. O texto
 * é um rascunho técnico e deve passar por revisão jurídica.
 */
export const CURRENT_TERMS_VERSION = '2026-11-17';

export const LEGAL_ENTITY = {
  name: '[RAZÃO SOCIAL — preencher]',
  cnpj: '[CNPJ — preencher]',
  address: '[endereço — preencher]',
  dpoEmail: '[e-mail do encarregado de dados — preencher]',
};

export interface LegalSection {
  title: string;
  paragraphs: string[];
}

export interface LegalDocument {
  slug: 'termos' | 'privacidade';
  title: string;
  sections: LegalSection[];
}

const controller = `${LEGAL_ENTITY.name}, CNPJ ${LEGAL_ENTITY.cnpj}, com sede em ${LEGAL_ENTITY.address}`;

export const TERMS_OF_USE: LegalDocument = {
  slug: 'termos',
  title: 'Termos de Uso',
  sections: [
    {
      title: '1. Quem somos e o que é a Lumina',
      paragraphs: [
        `A Lumina é uma plataforma de estudos para o ENEM e vestibulares, operada por ${controller}. Ela reúne banco de questões, simulados, correção de redação, cronograma, flashcards, turmas e a assistente LuminIA.`,
        'Ao criar uma conta ou usar a plataforma, você concorda com estes Termos e com a Política de Privacidade. Se não concordar, não use a Lumina.',
      ],
    },
    {
      title: '2. Conta e idade',
      paragraphs: [
        'Você é responsável pelas informações do cadastro e por manter sua senha em sigilo. Avise-nos se suspeitar de uso indevido da sua conta.',
        'Se você tem menos de 18 anos, só pode usar a Lumina com a autorização de um dos pais ou do responsável legal, que também deve ler estes Termos e a Política de Privacidade. Ao aceitar, você declara ter essa autorização.',
        'Contas de professor, coordenação e direção são usadas em nome de uma instituição, que responde pelo cadastro dos seus alunos e pelas informações que compartilha conosco.',
      ],
    },
    {
      title: '3. Uso permitido',
      paragraphs: [
        'A Lumina serve para estudar e ensinar. Não é permitido: copiar ou revender o conteúdo da plataforma em massa; tentar acessar contas ou dados de outras pessoas; enviar conteúdo ilegal, ofensivo ou que viole direitos de terceiros; usar robôs para extrair dados; ou atrapalhar o funcionamento do serviço.',
        'Nos grupos e turmas, trate os colegas com respeito. Podemos remover conteúdos e suspender contas que descumpram estas regras.',
      ],
    },
    {
      title: '4. Conteúdo que você envia',
      paragraphs: [
        'Redações, fotos de provas, questões, cadernos e mensagens que você envia continuam sendo seus. Você nos dá permissão para armazená-los e processá-los apenas para prestar o serviço a você (por exemplo, corrigir uma redação ou transcrever uma questão).',
        'Questões criadas por professores podem ser revisadas e, com o consentimento do autor, publicadas no banco da plataforma.',
      ],
    },
    {
      title: '5. Inteligência artificial',
      paragraphs: [
        'Correções, notas estimadas, explicações e sugestões da LuminIA são geradas por inteligência artificial e podem conter erros. Elas não substituem a correção oficial do ENEM nem a orientação de um professor.',
        'Notas de corte, estimativas de nota e chances de aprovação são aproximações baseadas em dados públicos e não garantem resultado.',
      ],
    },
    {
      title: '6. Planos e pagamentos',
      paragraphs: [
        'Parte dos recursos é gratuita, com limites de uso. Os planos pagos são cobrados pelo Asaas, nossa intermediadora de pagamentos, nas condições mostradas na página de planos no momento da contratação.',
        'Você pode cancelar a renovação quando quiser. O direito de arrependimento de 7 dias, previsto no Código de Defesa do Consumidor, vale para contratações feitas pela internet.',
      ],
    },
    {
      title: '7. Disponibilidade e responsabilidade',
      paragraphs: [
        'Trabalhamos para manter a Lumina no ar e segura, mas o serviço pode passar por manutenções e falhas. Não nos responsabilizamos por resultados em provas e processos seletivos.',
      ],
    },
    {
      title: '8. Encerramento da conta',
      paragraphs: [
        'Você pode pedir o encerramento da sua conta a qualquer momento pelo contato indicado abaixo. Podemos encerrar contas que violem estes Termos.',
      ],
    },
    {
      title: '9. Mudanças nos Termos',
      paragraphs: [
        'Podemos atualizar estes Termos. Quando a mudança for relevante, pediremos que você leia e aceite a nova versão no próximo acesso.',
      ],
    },
    {
      title: '10. Contato e foro',
      paragraphs: [
        `Dúvidas: ${LEGAL_ENTITY.dpoEmail}. Estes Termos seguem a lei brasileira. Fica eleito o foro do domicílio do usuário consumidor.`,
      ],
    },
  ],
};

export const PRIVACY_POLICY: LegalDocument = {
  slug: 'privacidade',
  title: 'Política de Privacidade',
  sections: [
    {
      title: '1. Controlador e encarregado',
      paragraphs: [
        `O controlador dos seus dados pessoais é ${controller}. O encarregado pelo tratamento de dados (DPO) pode ser contatado em ${LEGAL_ENTITY.dpoEmail}.`,
        'Quando você usa a Lumina por meio de uma escola ou cursinho, a instituição também decide sobre parte do uso dos seus dados (por exemplo, turmas e relatórios de desempenho).',
      ],
    },
    {
      title: '2. Dados que coletamos',
      paragraphs: [
        'Cadastro: nome, sobrenome, nome de usuário, e-mail, senha (guardada só em formato criptografado) e, se você usar o login do Google, os dados básicos do seu perfil Google.',
        'Perfil de estudos (opcional): telefone, data de nascimento, escola, série, curso e universidade desejados, modalidade no Sisu e preferências de horário.',
        'Uso da plataforma: respostas a questões, simulados, redações, fotos enviadas ao scanner, cadernos, flashcards, mensagens com a LuminIA e nos grupos, além de registros técnicos de acesso (data, hora e IP), que guardamos por 6 meses, como exige o Marco Civil da Internet.',
        'Pagamento: o CPF/CNPJ e os dados de cobrança vão direto para o Asaas. A Lumina não guarda número de cartão nem o CPF/CNPJ.',
      ],
    },
    {
      title: '3. Para que usamos e com qual base legal',
      paragraphs: [
        'Prestar o serviço que você contratou (execução de contrato): criar sua conta, montar o cronograma, corrigir redações, gerar relatórios e permitir turmas e grupos.',
        'Segurança e prevenção a fraudes (legítimo interesse) e cumprimento de obrigações legais, como a guarda de registros de acesso e de dados fiscais.',
        'Melhorar a plataforma com estatísticas agregadas (legítimo interesse). Não vendemos seus dados e não os usamos para publicidade de terceiros.',
        'Dados de crianças e adolescentes são tratados no seu melhor interesse, com a autorização de um dos pais ou do responsável legal.',
      ],
    },
    {
      title: '4. Com quem compartilhamos',
      paragraphs: [
        'Provedores de infraestrutura (hospedagem e banco de dados), de envio de e-mails, de pagamento (Asaas) e de inteligência artificial, que recebem só o necessário para cada tarefa — por exemplo, o texto de uma redação para correção. Alguns desses provedores ficam fora do Brasil; nesses casos exigimos garantias de proteção compatíveis com a LGPD.',
        'Sua instituição de ensino, se você entrou por meio dela, vê seu desempenho nas turmas. Professores de uma turma veem as respostas dos alunos dessa turma.',
        'Autoridades públicas, quando houver ordem judicial ou obrigação legal.',
      ],
    },
    {
      title: '5. Por quanto tempo guardamos',
      paragraphs: [
        'Enquanto sua conta estiver ativa. Depois do encerramento, apagamos ou anonimizamos os dados, exceto o que a lei manda guardar (registros de acesso por 6 meses e dados fiscais pelo prazo legal).',
      ],
    },
    {
      title: '6. Seus direitos',
      paragraphs: [
        'Pela LGPD (art. 18), você pode: confirmar se tratamos seus dados e acessá-los; corrigir dados incompletos ou desatualizados; pedir anonimização, bloqueio ou exclusão de dados desnecessários; pedir a portabilidade; saber com quem compartilhamos; e revogar o consentimento, quando ele for a base do tratamento.',
        `Para exercer esses direitos, escreva para ${LEGAL_ENTITY.dpoEmail}. Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).`,
      ],
    },
    {
      title: '7. Segurança',
      paragraphs: [
        'Usamos conexão criptografada, senhas com hash, controle de acesso por perfil e sessões que expiram. Se ocorrer um incidente que possa trazer risco a você, avisaremos você e a ANPD.',
      ],
    },
    {
      title: '8. Cookies e armazenamento local',
      paragraphs: [
        'O app guarda no seu navegador apenas o necessário para funcionar: as chaves da sua sessão e preferências como rascunhos e filtros. Não usamos cookies de publicidade.',
      ],
    },
    {
      title: '9. Mudanças nesta Política',
      paragraphs: [
        'Quando esta Política mudar de forma relevante, pediremos que você leia e aceite a nova versão no próximo acesso.',
      ],
    },
  ],
};

export const LEGAL_DOCUMENTS = { termos: TERMS_OF_USE, privacidade: PRIVACY_POLICY } as const;
