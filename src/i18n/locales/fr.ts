// French — translated from en.ts.
//
// Register: "vous" throughout, but plain and warm rather than administrative.
// The app helps one person write to one other person; the interface should sound
// like a thoughtful friend, never like a bank.

const fr = {
  // --- shell -----------------------------------------------------------------
  'app.title': '🎤 Rebuttal Generator',
  'app.subtitle': "Écrivez la réponse qui fait vraiment changer d'avis",
  'app.updateAvailable': '🎉 Une nouvelle version est disponible !',
  'app.reload': 'Recharger',

  // --- account ---------------------------------------------------------------
  'account.signIn': 'Se connecter',
  'account.signInWithGoogle': 'Se connecter avec Google',
  'account.signInBlurb': 'Connectez-vous pour garder vos clés API et votre langue sur tous vos appareils.',
  'account.signOut': 'Se déconnecter',
  'account.signedInAs': 'Connecté en tant que {name}',
  'account.menu': 'Compte',
  'account.keysSynced': 'Clés synchronisées',
  'account.keysLocked': 'Clés verrouillées',
  'account.unlock': 'Déverrouiller',
  'account.unlockTitle': 'Déverrouillez vos clés enregistrées',
  'account.unlockBlurb':
    'Vos clés sont chiffrées avec une phrase secrète qui ne quitte jamais votre appareil — nous-mêmes ne pouvons pas les lire. Saisissez-la une seule fois sur cet appareil.',
  'account.passphrase': 'Phrase secrète',
  'account.passphrasePlaceholder': 'La phrase secrète de votre coffre',
  'account.unlockAction': 'Déverrouiller',
  'account.wrongPassphrase': "Cette phrase secrète n'a pas déverrouillé vos clés. Réessayez.",
  'account.setupTitle': 'Gardez vos clés sur tous vos appareils',
  'account.setupBlurb':
    "Choisissez une phrase secrète. Vos clés API sont chiffrées avec elle dans ce navigateur avant d'être envoyées : le serveur ne stocke jamais qu'un texte brouillé qu'il ne peut pas lire.",
  'account.setupWarning':
    "Cette phrase secrète ne peut pas être récupérée. Si vous l'oubliez, il vous suffira de saisir à nouveau vos clés API — rien d'autre n'est perdu.",
  'account.confirmPassphrase': 'Confirmez la phrase secrète',
  'account.passphraseMismatch': 'Les deux phrases secrètes ne correspondent pas.',
  'account.passphraseShort': 'Utilisez au moins 12 caractères — une phrase trop courte peut être devinée hors ligne.',
  'account.passphraseLettersOnly': 'Ajoutez un chiffre ou un symbole pour la rendre plus difficile à deviner.',
  'account.saveKeys': 'Chiffrer et enregistrer',
  'account.forgetKeys': 'Supprimer les clés enregistrées',
  'account.forgetKeysConfirm': 'Supprimer vos clés chiffrées du serveur ? Vos clés restent dans ce navigateur.',
  'account.notNow': 'Pas maintenant',
  'account.syncing': 'Enregistrement…',
  'account.vaultSaved': 'Vos clés sont chiffrées et enregistrées.',

  // --- language --------------------------------------------------------------
  'language.label': 'Langue',
  'language.switchToEnglish': 'English',
  'language.choose': 'Choisir la langue',
  'language.followDevice': 'Suivre mon appareil',

  // --- AI settings -----------------------------------------------------------
  'settings.chooseModel': 'Choisir un modèle',
  'settings.hide': 'Masquer',
  'settings.change': 'Modifier',
  'settings.provider': "Fournisseur d'IA",
  'settings.model': 'Modèle',
  'settings.refresh': '↻ Actualiser',
  'settings.refreshing': 'Actualisation…',
  'settings.refreshTitle': 'Récupérer la liste actuelle des modèles du fournisseur',
  'settings.useShortList': 'revenir à la liste courte',
  'settings.useShortListTitle': 'Revenir à la liste courte, choisie à la main',
  'settings.modelsUpdated': '{count} modèles · mis à jour le {date}',
  'settings.apiKeyLabel': 'Clé API {provider}',
  'settings.apiKeyPlaceholder': 'Saisissez votre clé API',
  'settings.saveKey': 'Enregistrer la clé',
  'settings.cancel': 'Annuler',
  'settings.changeKey': 'Changer de clé API',
  'settings.keyHelpFree':
    "Ce fournisseur demande une clé API même pour ses modèles gratuits, mais la créer ne coûte rien — aucune information de paiement n'est demandée. ",
  'settings.keyHelpPaid':
    "Votre clé est enregistrée dans ce navigateur uniquement, et envoyée seulement à ce fournisseur. Vous n'aurez pas à la saisir de nouveau. ",
  'settings.keyHelpSynced':
    "Votre clé est chiffrée sur cet appareil puis synchronisée avec votre compte : vous n'aurez plus à la saisir, sur aucun appareil. ",
  'settings.getOneFrom': 'Obtenez-en une sur',
  'settings.preferNoKey': "Vous préférez ne pas avoir de clé du tout ? Choisissez {option} dans la liste des fournisseurs d'IA.",
  'settings.localOption': 'En local dans le navigateur (GRATUIT, sans clé)',
  'settings.tavilyLabel': 'Clé pour la recherche de sources',
  'settings.optional': 'facultatif',
  'settings.save': 'Enregistrer',
  'settings.saved': '✓ Enregistré',
  'settings.tavilyHelp':
    "La recherche de sources fonctionne déjà sans aucune clé. Une clé {link} gratuite (1 000 recherches par mois, sans carte bancaire) sert seulement à relever la limite si vous l'atteignez.",
  'settings.costPerReply': '≈ {cost} par réponse',
  'settings.costIncludesReasoning': '≈ {cost} par réponse (jetons de raisonnement masqués compris)',
  'settings.costFreeLocal': "Gratuit — tout se passe sur votre appareil, rien n'est facturé",
  'settings.costUnknown': 'Tarif inconnu pour ce modèle',
  'settings.costFreeModel': 'Modèle gratuit — rien à payer',

  // --- input -----------------------------------------------------------------
  'input.label': 'À quoi répondez-vous ?',
  'input.modeGroup': 'Mode de saisie',
  'input.modeText': '✍️ Dicter ou écrire',
  'input.modeUrl': "🔗 URL de l'article",
  'input.urlPlaceholder': 'https://exemple.com/l-article',
  'input.fetchArticle': "Récupérer l'article",
  'input.fetching': 'Récupération…',
  'input.startRecording': "🎙 Démarrer l'enregistrement",
  'input.stopRecording': "⏹ Arrêter l'enregistrement",
  'input.recording': 'Enregistrement…',
  'input.clear': 'Effacer',
  'input.placeholderText': "Écrivez l'argument ici, ou utilisez Démarrer l'enregistrement pour le dicter…",
  'input.placeholderUrl': "Le texte de l'article apparaîtra ici une fois récupéré — vous pourrez le modifier avant de générer la réponse.",
  'input.articleWords': '{count} mots',
  'input.articleViaArchive': ' · lu depuis une capture Internet Archive',
  'input.articleTruncated': ' · raccourci pour alléger la requête',

  // --- audience --------------------------------------------------------------
  'audience.label': "Qui l'a écrit, et où ?",
  'audience.optional': 'facultatif — mais cela change la façon dont la réponse est écrite',
  'audience.placeholder': 'ex. : mon beau-père, par SMS · un inconnu sur LinkedIn',
  'audience.help':
    "Laissez vide et cela sera déduit du texte. En disant qui est cette personne, la réponse peut s'appuyer sur des sources auxquelles elle fait déjà confiance et coller à sa façon de parler.",

  // --- reply language --------------------------------------------------------
  'replyLang.detected': 'Réponse en {language}',
  'replyLang.change': 'changer',
  'replyLang.label': 'Écrire la réponse en',
  'replyLang.help': "La réponse s'adresse à la personne qui a écrit l'argument : elle suit donc sa langue à elle, pas celle de l'interface.",
  'replyLang.auto': "Suivre la langue de l'argument ({language})",

  // --- sources ---------------------------------------------------------------
  'sources.toggle': 'Trouver de vraies sources à citer',
  'sources.hint':
    " — le web est consulté d'abord, et la réponse ne peut citer que ce qui a réellement été trouvé. Fonctionne avec tous les modèles, sans clé.",

  // --- generate --------------------------------------------------------------
  'generate.submit': '✨ Écrire ma réponse',
  'generate.working': 'Rédaction…',
  'generate.searching': 'Recherche de sources…',
  'generate.writing': 'Rédaction de la réponse…',
  'generate.srStatus': 'Génération de la réponse en cours',

  // --- reply -----------------------------------------------------------------
  'reply.title': 'Votre réponse',
  'reply.copy': '📋 Copier le message',
  'reply.copied': '✓ Copié',
  'reply.sourcesCited': '{count} sources citées',
  'reply.sourcesCitedOne': '1 source citée',
  'reply.noSources': 'Aucune source citée',
  'reply.linksRemoved': ' · {count} liens non vérifiés supprimés',
  'reply.linksRemovedOne': ' · 1 lien non vérifié supprimé',
  'reply.toCheck': ' · {count} à vérifier',
  'reply.claimWarn':
    "Le modèle a produit {count} liens qui ne figuraient pas parmi les sources réellement récupérées. Ils ont été supprimés plutôt que montrés, parce qu'une source inventée est pire que pas de source du tout.",
  'reply.claimWarnOne':
    "Le modèle a produit 1 lien qui ne figurait pas parmi les sources réellement récupérées. Il a été supprimé plutôt que montré, parce qu'une source inventée est pire que pas de source du tout.",
  'reply.checkBeforeSending': "À vérifier avant d'envoyer",
  'reply.noSourcesRetrieved':
    "Aucune source n'a été récupérée pour cette réponse. Chaque affirmation factuelle qu'elle contient est donc non vérifiée — contrôlez tout ce sur quoi vous comptez vous appuyer.",
  'reply.sourcesTitle': 'Sources',

  // --- weak link + briefing --------------------------------------------------
  'weakLink.title': "⚠️ Avant d'envoyer — le point faible de votre position",
  'briefing.title': 'Son meilleur argument — et où vous y répondez',
  'briefing.tag': 'pour vous — à ne pas envoyer',
  'briefing.building': 'Construction de son argument le plus fort…',
  'briefing.answered': 'Votre réponse y répond-elle ?',
  'briefing.unused': 'Trouvé mais non utilisé',

  // --- share -----------------------------------------------------------------
  'share.get': '🔗 Obtenir un lien à partager',
  'share.creating': 'Création du lien…',
  'share.copyLink': 'Copier le lien',
  'share.caveat': 'Publie cet argument et cette réponse : toute personne ayant le lien pourra les lire',
  'share.help':
    "Toute personne ayant ce lien peut lire l'argument et la réponse. La page est non répertoriée — ni indexée, ni consultable en naviguant — mais elle n'est pas privée. Les liens expirent au bout d'un an.",
  'share.banner': "Quelqu'un a partagé cette réponse avec vous",
  'share.generatedWith': 'Généré avec {model}',
  'share.generatedWithAI': "Généré avec de l'IA",
  'share.theArgument': "L'argument",
  'share.theReply': 'La réponse',
  'share.steelmanHeading': 'Le meilleur plaidoyer EN FAVEUR de cet argument',
  'share.from': 'De',
  'share.writeYourOwn': '✍️ Écrivez votre propre réponse',
  'share.startFresh': 'Repartir de zéro',

  // --- cost ------------------------------------------------------------------
  'cost.actual': 'Coût :',
  'cost.tokens': '({in} en entrée / {out} en sortie)',
  'cost.tokensWithReasoning': '({in} en entrée / {out} en sortie, {reasoning} de raisonnement)',
  'cost.sessionTotal': ' · total de la session {total}',

  // --- errors ----------------------------------------------------------------
  'error.needArgument': "Commencez par ajouter l'argument auquel vous voulez répondre",
  'error.needModel': 'Choisissez un modèle',
  'error.needKey': 'Saisissez une clé API valide',
  'error.needKeyForModels': "Saisissez d'abord votre clé API — la liste des modèles vient du fournisseur.",
  'error.timeout': 'La requête a expiré. Réessayez.',
  'error.generic': "Impossible d'écrire la réponse",
  'error.refreshModels': "Impossible d'actualiser la liste des modèles",
  'error.briefing': 'Impossible de reconstituer son argumentaire.',
  'error.publish': 'Impossible de publier cette réponse.',
  'error.loadShared': "Cette réponse partagée n'a pas pu être chargée.",
  'error.article': 'Impossible de charger cet article. Essayez plutôt de coller le texte.',
  'error.searchUnavailable': "La recherche de sources n'était pas disponible.",
  'error.speechUnsupported': "La reconnaissance vocale n'est pas prise en charge par ce navigateur. Utilisez Chrome, Edge ou Safari.",
  'error.micDenied': "L'accès au microphone a été refusé. Autorisez le microphone pour ce site, puis réessayez.",
  'error.micMissing': "Aucun microphone n'a été détecté. Vérifiez qu'un microphone est branché, puis réessayez.",
  'error.speechNetwork': 'Le service de reconnaissance vocale a rencontré une erreur réseau. Vérifiez votre connexion, puis réessayez.',

  // --- instant mode ------------------------------------------------------------
  'instant.working': 'Rédaction de votre réponse (sans clé)…',
  'instant.left': "{n} réponses gratuites restantes aujourd'hui",
  'instant.leftOne': "1 réponse gratuite restante aujourd'hui",
  'instant.done.title': "Plus de réponses gratuites pour aujourd'hui",
  'instant.done.body':
    'Elles reviennent à {time}. Connectez-vous pour en recevoir plus chaque jour, ou ajoutez votre propre clé API pour des réponses illimitées qui ne passent jamais par nos serveurs.',
  'instant.done.signIn': 'Se connecter avec Google',
  'instant.done.byok': 'Utiliser plutôt ma propre clé API',
  'instant.turnstile': 'La vérification a échoué — rechargez la page et réessayez.',
  'instant.error': "Le mode instantané n'est pas disponible pour le moment — réessayez bientôt, ou utilisez votre propre clé API.",
  'instant.badge': 'Mode instantané',
}

export default fr
