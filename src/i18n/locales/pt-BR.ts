// Brazilian Portuguese — translated from en.ts, which stays the source of truth.
//
// Register: "você", informal but thoughtful — the way one adult writes to another
// adult they respect. No "prezado usuário", no "efetuar", no corporate voice.
// Placeholders like {count} are copied verbatim; only the words around them move.

const pt_BR = {
  // --- shell -----------------------------------------------------------------
  'app.title': '🎤 Rebuttal Generator',
  'app.subtitle': 'Escreva a resposta que realmente muda a cabeça da pessoa',
  'app.updateAvailable': '🎉 Tem uma versão nova!',
  'app.reload': 'Recarregar',

  // --- account ---------------------------------------------------------------
  'account.signIn': 'Entrar',
  'account.signInBlurb': 'Entre para manter suas chaves de API e seu idioma em todos os dispositivos.',
  'account.signOut': 'Sair',
  'account.signedInAs': 'Entrou como {name}',
  'account.menu': 'Conta',
  'account.keysSynced': 'Chaves sincronizadas',
  'account.keysLocked': 'Chaves bloqueadas',
  'account.unlock': 'Desbloquear',
  'account.unlockTitle': 'Desbloqueie suas chaves salvas',
  'account.unlockBlurb':
    'Suas chaves são criptografadas com uma frase secreta que nunca sai do seu dispositivo — nem nós conseguimos ler o que está ali. Basta digitá-la uma vez neste dispositivo.',
  'account.passphrase': 'Frase secreta',
  'account.passphrasePlaceholder': 'A frase secreta do seu cofre',
  'account.unlockAction': 'Desbloquear',
  'account.wrongPassphrase': 'Essa frase secreta não abriu suas chaves. Tente de novo.',
  'account.setupTitle': 'Guarde suas chaves para usar em qualquer dispositivo',
  'account.setupBlurb':
    'Escolha uma frase secreta. Suas chaves de API são criptografadas com ela aqui no navegador antes de subirem, então o servidor só guarda um texto embaralhado que ele não consegue ler.',
  'account.setupWarning':
    'Não existe jeito de recuperar essa frase secreta. Se você esquecer, é só digitar suas chaves de API de novo — nada além disso se perde.',
  'account.confirmPassphrase': 'Confirme a frase secreta',
  'account.passphraseMismatch': 'As duas frases secretas não são iguais.',
  'account.passphraseShort': 'Use pelo menos 12 caracteres — uma frase curta é fácil de descobrir na tentativa e erro.',
  'account.passphraseLettersOnly': 'Acrescente um número ou símbolo para ficar mais difícil de adivinhar.',
  'account.saveKeys': 'Criptografar e salvar',
  'account.forgetKeys': 'Apagar as chaves salvas',
  'account.forgetKeysConfirm': 'Apagar suas chaves criptografadas do servidor? Elas continuam salvas neste navegador.',
  'account.notNow': 'Agora não',
  'account.syncing': 'Salvando…',
  'account.vaultSaved': 'Suas chaves foram criptografadas e salvas.',
  'account.signInOrUp': 'Entrar / Criar conta',
  'account.benefitsTitle': 'Por que entrar?',
  'account.benefitsKeys':
    'Suas chaves de API vão com você para qualquer dispositivo — criptografadas para que só você consiga ler.',
  'account.benefitsHistory': 'Seu histórico de respostas também sincroniza, protegido do mesmo jeito.',
  'account.benefitsQuota': 'Seis respostas instantâneas grátis por dia, em vez de três.',
  'account.benefitsLanguage': 'Sua escolha de idioma vale em qualquer lugar em que você entrar.',
  'account.signUpTitle': 'Crie sua conta',
  'account.signInTitle': 'Entrar',
  'account.continueWithGoogle': 'Continuar com o Google',
  'account.orDivider': 'ou',
  'account.username': 'Nome de usuário',
  'account.usernamePlaceholder': '3–32 letras, números, - ou _',
  'account.password': 'Senha',
  'account.confirmPassword': 'Confirme a senha',
  'account.emailOptional': 'E-mail (opcional)',
  'account.noEmailWarning':
    'Sem e-mail, não existe jeito de entrar de novo se você esquecer esta senha — não há como redefini-la. Anote em algum lugar seguro.',
  'account.createAccount': 'Criar conta',
  'account.signInAction': 'Entrar',
  'account.switchToSignIn': 'Já tem uma conta? Entre',
  'account.switchToSignUp': 'Primeira vez aqui? Crie uma conta',
  'account.passwordShort': 'Use pelo menos 10 caracteres.',
  'account.passwordMismatch': 'As duas senhas não são iguais.',
  'account.usernameInvalid': 'Nomes de usuário têm 3–32 caracteres: letras, números, - ou _.',
  'account.usernameTaken': 'Esse nome de usuário já está em uso — tente outro.',
  'account.badCredentials': 'Esse nome de usuário e essa senha não conferem.',
  'account.rateLimited': 'Tentativas demais — espere alguns minutos e tente de novo.',
  'account.emailInvalid': 'Esse endereço de e-mail não parece certo.',
  'account.serverError': 'Algo deu errado do nosso lado. Tente de novo em instantes.',
  'account.signOutFirst':
    'Essa é uma conta diferente. Para manter as contas separadas, este dispositivo foi desconectado e o histórico salvo nele foi apagado — entre de novo para continuar.',
  'account.authError': 'Não deu para concluir a entrada. Tente de novo.',

  // --- language --------------------------------------------------------------
  'language.label': 'Idioma',
  'language.switchToEnglish': 'English',
  'language.choose': 'Escolha o idioma',
  'language.followDevice': 'Usar o idioma do meu dispositivo',

  // --- AI settings -----------------------------------------------------------
  'settings.chooseModel': 'Escolha um modelo',
  'settings.hide': 'Ocultar',
  'settings.change': 'Trocar',
  'settings.provider': 'Provedor de IA',
  'settings.model': 'Modelo',
  'settings.refresh': '↻ Atualizar',
  'settings.refreshing': 'Atualizando…',
  'settings.refreshTitle': 'Buscar a lista de modelos atual do provedor',
  'settings.useShortList': 'usar a lista curta',
  'settings.useShortListTitle': 'Voltar para a lista curta, escolhida a dedo',
  'settings.modelsUpdated': '{count} modelos · atualizada em {date}',
  'settings.apiKeyLabel': 'Chave de API — {provider}',
  'settings.apiKeyPlaceholder': 'Digite sua chave de API',
  'settings.saveKey': 'Salvar a chave',
  'settings.cancel': 'Cancelar',
  'settings.changeKey': 'Trocar a chave de API',
  'settings.keyHelpFree':
    'Este provedor pede uma chave de API mesmo para os modelos gratuitos, mas criar a chave não custa nada — sem cartão, sem dados de pagamento. ',
  'settings.keyHelpPaid':
    'Sua chave fica salva só neste navegador e é enviada só para este provedor. Você não vai precisar digitar de novo. ',
  'settings.keyHelpSynced':
    'Sua chave é criptografada neste dispositivo e sincronizada com a sua conta, então você não vai precisar digitar de novo em nenhum dispositivo. ',
  'settings.getOneFrom': 'Pegue a sua em',
  'settings.preferNoKey': 'Prefere não usar chave nenhuma? Escolha {option} na lista de provedores de IA.',
  'settings.localOption': 'Local, no navegador (GRÁTIS, sem chave)',
  'settings.tavilyLabel': 'Chave para a busca de evidências',
  'settings.optional': 'opcional',
  'settings.save': 'Salvar',
  'settings.saved': '✓ Salvo',
  'settings.tavilyHelp':
    'A busca de evidências já funciona sem chave nenhuma. Uma chave gratuita da {link} (1.000 buscas por mês, sem cartão) só serve para aumentar o limite, se você esbarrar nele.',
  'settings.costPerReply': '≈ {cost} por resposta',
  'settings.costIncludesReasoning': '≈ {cost} por resposta (inclui os tokens de raciocínio que ficam ocultos)',
  'settings.costFreeLocal': 'Grátis — roda no seu dispositivo, nada é cobrado',
  'settings.costUnknown': 'Preço desconhecido para este modelo',
  'settings.costFreeModel': 'Modelo gratuito — sem cobrança',

  // --- input -----------------------------------------------------------------
  'input.label': 'Você está respondendo a quê?',
  'input.modeGroup': 'Modo de entrada',
  'input.modeText': '✍️ Falar ou digitar',
  'input.modeUrl': '🔗 Link do artigo',
  'input.urlPlaceholder': 'https://exemplo.com/o-artigo',
  'input.fetchArticle': 'Buscar o artigo',
  'input.fetching': 'Buscando…',
  'input.startRecording': '🎙 Começar a gravar',
  'input.stopRecording': '⏹ Parar a gravação',
  'input.recording': 'Gravando…',
  'input.clear': 'Limpar',
  'input.placeholderText': 'Digite aqui o argumento, ou use Começar a gravar para ditar…',
  'input.placeholderUrl': 'O texto do artigo aparece aqui depois da busca — dá para editar antes de gerar a resposta.',
  'input.articleWords': '{count} palavras',
  'input.articleViaArchive': ' · lido de uma cópia do Internet Archive',
  'input.articleTruncated': ' · encurtado para deixar o pedido menor',

  // --- audience --------------------------------------------------------------
  'audience.label': 'Quem escreveu, e onde?',
  'audience.optional': 'opcional — mas muda o jeito de escrever a resposta',
  'audience.placeholder': 'ex.: meu sogro, por mensagem · um desconhecido no LinkedIn',
  'audience.help':
    'Se deixar em branco, isso é deduzido do próprio texto. Dizer quem é a pessoa deixa a resposta usar fontes em que ela já confia e falar do jeito que ela fala.',

  // --- reply language --------------------------------------------------------
  'replyLang.detected': 'Respondendo em {language}',
  'replyLang.change': 'trocar',
  'replyLang.label': 'Escrever a resposta em',
  'replyLang.help':
    'A resposta vai para quem escreveu o argumento, então ela segue o idioma dessa pessoa, e não o idioma da interface.',
  'replyLang.auto': 'Seguir o argumento ({language})',

  // --- sources ---------------------------------------------------------------
  'sources.toggle': 'Buscar evidências reais para citar',
  'sources.hint':
    ' — busca na web primeiro, e a resposta só pode citar o que foi realmente encontrado. Funciona em qualquer modelo, sem precisar de chave.',

  // --- generate --------------------------------------------------------------
  'generate.submit': '✨ Escrever minha resposta',
  'generate.working': 'Escrevendo…',
  'generate.searching': 'Buscando evidências…',
  'generate.writing': 'Escrevendo a resposta…',
  'generate.srStatus': 'Gerando a resposta',

  // --- reply -----------------------------------------------------------------
  'reply.title': 'Sua resposta',
  'reply.copy': '📋 Copiar a mensagem',
  'reply.copied': '✓ Copiado',
  'reply.sourcesCited': '{count} fontes citadas',
  'reply.sourcesCitedOne': '1 fonte citada',
  'reply.noSources': 'Nenhuma fonte citada',
  'reply.linksRemoved': ' · {count} links sem verificação foram removidos',
  'reply.linksRemovedOne': ' · 1 link sem verificação foi removido',
  'reply.toCheck': ' · {count} para conferir',
  'reply.claimWarn':
    'O modelo gerou {count} links que não estavam entre as fontes realmente encontradas. Eles foram removidos em vez de aparecer para você, porque uma citação inventada é pior do que nenhuma.',
  'reply.claimWarnOne':
    'O modelo gerou 1 link que não estava entre as fontes realmente encontradas. Ele foi removido em vez de aparecer para você, porque uma citação inventada é pior do que nenhuma.',
  'reply.checkBeforeSending': 'Confira antes de enviar',
  'reply.noSourcesRetrieved':
    'Nenhuma fonte foi encontrada para esta resposta. Cada afirmação de fato aqui está sem verificação — confira qualquer ponto em que você for se apoiar.',
  'reply.sourcesTitle': 'Fontes',

  // --- weak link + briefing --------------------------------------------------
  'weakLink.title': '⚠️ Antes de enviar — o ponto fraco da sua posição',
  'briefing.title': 'O melhor argumento do outro lado — e onde você responde a ele',
  'briefing.tag': 'só para você ler — não envie',
  'briefing.building': 'Montando o argumento mais forte do outro lado…',
  'briefing.answered': 'Sua resposta dá conta disso?',
  'briefing.unused': 'Encontradas, mas não usadas',

  // --- share -----------------------------------------------------------------
  'share.get': '🔗 Gerar um link para compartilhar',
  'share.creating': 'Criando o link…',
  'share.copyLink': 'Copiar o link',
  'share.caveat': 'Publica este argumento e esta resposta, então quem tiver o link pode ler os dois',
  'share.help':
    'Qualquer pessoa com este link pode ler o argumento e a resposta. A página não fica listada — não é indexada nem aparece em buscas — mas também não é privada. Os links expiram depois de um ano.',
  'share.banner': 'Alguém compartilhou esta resposta com você',
  'share.generatedWith': 'Gerado com {model}',
  'share.generatedWithAI': 'Gerado com IA',
  'share.theArgument': 'O argumento',
  'share.theReply': 'A resposta',
  'share.steelmanHeading': 'O argumento mais forte A FAVOR dessa posição',
  'share.from': 'De',
  'share.writeYourOwn': '✍️ Escreva a sua própria resposta',
  'share.startFresh': 'Começar do zero',

  // --- cost ------------------------------------------------------------------
  'cost.actual': 'Custo:',
  'cost.tokens': '({in} entrada / {out} saída)',
  'cost.tokensWithReasoning': '({in} entrada / {out} saída, {reasoning} raciocínio)',
  'cost.sessionTotal': ' · total da sessão {total}',

  // --- errors ----------------------------------------------------------------
  'error.needArgument': 'Primeiro coloque aqui o argumento que você quer responder',
  'error.needModel': 'Escolha um modelo',
  'error.needKey': 'Digite uma chave de API válida',
  'error.needKeyForModels': 'Digite sua chave de API primeiro — a lista de modelos vem do provedor.',
  'error.timeout': 'O pedido demorou demais e foi cancelado. Tente de novo.',
  'error.generic': 'Não deu para escrever a resposta',
  'error.refreshModels': 'Não deu para atualizar a lista de modelos',
  'error.briefing': 'Não deu para montar o argumento do outro lado.',
  'error.publish': 'Não deu para publicar esta resposta.',
  'error.loadShared': 'Não deu para carregar essa resposta compartilhada.',
  'error.article': 'Não deu para carregar esse artigo. Tente colar o texto direto.',
  'error.searchUnavailable': 'A busca de evidências não estava disponível.',
  'error.speechUnsupported': 'Este navegador não reconhece fala. Use o Chrome, o Edge ou o Safari.',
  'error.micDenied': 'O acesso ao microfone foi negado. Libere o microfone para este site e tente de novo.',
  'error.micMissing': 'Nenhum microfone foi encontrado. Veja se tem um microfone conectado e tente de novo.',
  'error.speechNetwork': 'O serviço de reconhecimento de fala teve um erro de rede. Confira sua conexão e tente de novo.',

  // --- instant mode ------------------------------------------------------------
  'instant.working': 'Escrevendo sua resposta (sem precisar de chave)…',
  'instant.left': '{n} respostas grátis restantes hoje',
  'instant.leftOne': '1 resposta grátis restante hoje',
  'instant.done.title': 'As respostas grátis acabaram por hoje',
  'instant.done.body':
    'Elas voltam às {time}. Entre para ganhar um limite diário maior, ou adicione sua própria chave de API para respostas ilimitadas que nunca passam pelos nossos servidores.',
  'instant.done.byok': 'Usar minha própria chave de API',
  'instant.turnstile': 'A verificação falhou — recarregue a página e tente de novo.',
  'instant.error': 'O modo instantâneo está indisponível agora — tente de novo em instantes, ou use sua própria chave de API.',
  'instant.badge': 'Modo instantâneo',

  // --- history ---------------------------------------------------------------
  'history.show': 'Histórico',
  'history.hide': 'Ocultar histórico',
  'history.empty': 'Ainda não há respostas salvas — toda resposta que você gerar fica salva aqui, neste dispositivo.',
  'history.localOnly':
    'Salvo só neste dispositivo. Entre e desbloqueie seu cofre para sincronizar, de forma criptografada, entre os dispositivos.',
  'history.synced': 'Criptografado e sincronizado com sua conta. Só os seus dispositivos conseguem ler.',
  'history.delete': 'Apagar este item',
  'history.clear': 'Apagar todo o histórico',
  'history.clearConfirm': 'Apagar todas as respostas salvas? A cópia sincronizada também é apagada. Isso não pode ser desfeito.',
}

export default pt_BR
