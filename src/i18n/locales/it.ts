// Italiano — traduzione di en.ts, che resta la fonte di verità.
//
// NOTE DI TRADUZIONE
// - I segnaposto `{name}` sono verbatim; le parole intorno possono spostarsi.
// - Nomi di prodotto e provider (Rebuttal Generator, Claude, Gemini, Tavily,
//   OpenRouter, Groq, DeepSeek, Google) restano in inglese.
// - Registro: "tu", sempre. Il "Lei" qui suonerebbe da software aziendale, ed è
//   esattamente il tono che questa app non deve avere.
// - "passphrase" è resa con "frase segreta": chi non è tecnico la capisce subito.

const it = {
  // --- shell -----------------------------------------------------------------
  'app.title': '🎤 Rebuttal Generator',
  'app.subtitle': 'Scrivi la risposta che fa davvero cambiare idea',
  'app.updateAvailable': '🎉 È disponibile una nuova versione!',
  'app.reload': 'Ricarica',

  // --- account ---------------------------------------------------------------
  'account.signIn': 'Accedi',
  'account.signInWithGoogle': 'Accedi con Google',
  'account.signInBlurb': 'Accedi per ritrovare le tue chiavi API e la tua lingua su ogni dispositivo.',
  'account.signOut': 'Esci',
  'account.signedInAs': 'Connesso come {name}',
  'account.menu': 'Account',
  'account.keysSynced': 'Chiavi sincronizzate',
  'account.keysLocked': 'Chiavi bloccate',
  'account.unlock': 'Sblocca',
  'account.unlockTitle': 'Sblocca le chiavi che hai salvato',
  'account.unlockBlurb':
    "Le tue chiavi sono cifrate con una frase segreta che non lascia mai il tuo dispositivo: nemmeno noi possiamo leggerle. Inseriscila una volta sola su questo dispositivo.",
  'account.passphrase': 'Frase segreta',
  'account.passphrasePlaceholder': 'La frase segreta della tua cassaforte',
  'account.unlockAction': 'Sblocca',
  'account.wrongPassphrase': 'Questa frase segreta non ha sbloccato le tue chiavi. Riprova.',
  'account.setupTitle': 'Tieni le tue chiavi su ogni dispositivo',
  'account.setupBlurb':
    'Scegli una frase segreta. Le tue chiavi API vengono cifrate con quella qui nel browser, prima di partire: sul server arriva soltanto testo mescolato, che il server non è in grado di leggere.',
  'account.setupWarning':
    "Questa frase segreta non si può recuperare in nessun modo. Se la dimentichi, ti basta reinserire le tue chiavi API: non perdi nient'altro.",
  'account.confirmPassphrase': 'Conferma la frase segreta',
  'account.passphraseMismatch': 'Le due frasi segrete non coincidono.',
  'account.passphraseShort': 'Usa almeno 12 caratteri: una frase segreta corta si può indovinare offline.',
  'account.passphraseLettersOnly': 'Aggiungi un numero o un simbolo per renderla più difficile da indovinare.',
  'account.saveKeys': 'Cifra e salva',
  'account.forgetKeys': 'Elimina le chiavi salvate',
  'account.forgetKeysConfirm': 'Eliminare dal server le tue chiavi cifrate? In questo browser restano dove sono.',
  'account.notNow': 'Non adesso',
  'account.syncing': 'Salvataggio…',
  'account.vaultSaved': 'Le tue chiavi sono cifrate e salvate.',

  // --- language --------------------------------------------------------------
  'language.label': 'Lingua',
  'language.switchToEnglish': 'English',
  'language.choose': 'Scegli la lingua',
  'language.followDevice': 'Come il mio dispositivo',

  // --- AI settings -----------------------------------------------------------
  'settings.chooseModel': 'Scegli un modello',
  'settings.hide': 'Nascondi',
  'settings.change': 'Cambia',
  'settings.provider': 'Provider AI',
  'settings.model': 'Modello',
  'settings.refresh': '↻ Aggiorna',
  'settings.refreshing': 'Aggiornamento…',
  'settings.refreshTitle': "Scarica l'elenco aggiornato dei modelli del provider",
  'settings.useShortList': 'usa la lista breve',
  'settings.useShortListTitle': 'Torna alla lista breve, scelta a mano',
  'settings.modelsUpdated': '{count} modelli · aggiornata il {date}',
  'settings.apiKeyLabel': 'Chiave API {provider}',
  'settings.apiKeyPlaceholder': 'Inserisci la tua chiave API',
  'settings.saveKey': 'Salva la chiave',
  'settings.cancel': 'Annulla',
  'settings.changeKey': 'Cambia la chiave API',
  'settings.keyHelpFree':
    'Questo provider chiede una chiave API anche per i suoi modelli gratuiti, ma crearla non costa nulla: non servono dati di pagamento. ',
  'settings.keyHelpPaid':
    'La tua chiave viene salvata solo in questo browser e inviata solo a questo provider. Non dovrai reinserirla. ',
  'settings.keyHelpSynced':
    'La tua chiave viene cifrata su questo dispositivo e sincronizzata con il tuo account, così non dovrai reinserirla su nessun dispositivo. ',
  'settings.getOneFrom': 'Puoi ottenerne una da',
  'settings.preferNoKey': 'Preferisci non usare nessuna chiave? Scegli {option} nel menu Provider AI.',
  'settings.localOption': 'In locale nel browser (GRATIS, senza chiave)',
  'settings.tavilyLabel': 'Chiave per la ricerca di prove',
  'settings.optional': 'facoltativa',
  'settings.save': 'Salva',
  'settings.saved': '✓ Salvato',
  'settings.tavilyHelp':
    'La ricerca di prove funziona già senza nessuna chiave. Una chiave {link} gratuita (1.000 ricerche al mese, senza carta) serve solo ad alzare il limite, se mai lo raggiungi.',
  'settings.costPerReply': '≈ {cost} a risposta',
  'settings.costIncludesReasoning': '≈ {cost} a risposta (inclusi i token di ragionamento nascosti)',
  'settings.costFreeLocal': 'Gratis: gira sul tuo dispositivo, non ti viene addebitato nulla',
  'settings.costUnknown': 'Prezzo sconosciuto per questo modello',
  'settings.costFreeModel': 'Modello gratuito: nessun costo',

  // --- input -----------------------------------------------------------------
  'input.label': 'A cosa stai rispondendo?',
  'input.modeGroup': 'Modalità di inserimento',
  'input.modeText': '✍️ Detta o scrivi',
  'input.modeUrl': "🔗 URL dell'articolo",
  'input.urlPlaceholder': 'https://example.com/articolo',
  'input.fetchArticle': "Carica l'articolo",
  'input.fetching': 'Caricamento…',
  'input.startRecording': '🎙 Inizia a registrare',
  'input.stopRecording': '⏹ Ferma la registrazione',
  'input.recording': 'Registrazione…',
  'input.clear': 'Cancella',
  'input.placeholderText': "Scrivi qui l'argomentazione, oppure usa Inizia a registrare per dettarla…",
  'input.placeholderUrl':
    "Il testo dell'articolo comparirà qui una volta caricato: puoi modificarlo prima di generare la risposta.",
  'input.articleWords': '{count} parole',
  'input.articleViaArchive': ' · letto da una copia su Internet Archive',
  'input.articleTruncated': ' · accorciato per non appesantire la richiesta',

  // --- audience --------------------------------------------------------------
  'audience.label': "Chi l'ha scritta, e dove?",
  'audience.optional': 'facoltativo — ma cambia il modo in cui la risposta viene scritta',
  'audience.placeholder': 'es. mio suocero, via messaggi · uno sconosciuto su LinkedIn',
  'audience.help':
    'Se lo lasci vuoto, viene dedotto dal testo. Dire chi è la persona permette alla risposta di usare fonti di cui si fida già e di adattarsi al modo in cui parla davvero.',

  // --- reply language --------------------------------------------------------
  'replyLang.detected': 'Risposta in {language}',
  'replyLang.change': 'cambia',
  'replyLang.label': 'Scrivi la risposta in',
  'replyLang.help':
    "La risposta va alla persona che ha scritto l'argomentazione, quindi segue la sua lingua, non quella dell'interfaccia.",
  'replyLang.auto': "Come l'argomentazione ({language})",

  // --- sources ---------------------------------------------------------------
  'sources.toggle': 'Cerca prove vere da citare',
  'sources.hint':
    ' — prima cerca sul web, e la risposta può citare solo quello che è stato davvero trovato. Funziona con ogni modello, senza bisogno di chiavi.',

  // --- generate --------------------------------------------------------------
  'generate.submit': '✨ Scrivi la mia risposta',
  'generate.working': 'Sto scrivendo…',
  'generate.searching': 'Cerco le prove…',
  'generate.writing': 'Scrivo la risposta…',
  'generate.srStatus': 'Sto generando la risposta',

  // --- reply -----------------------------------------------------------------
  'reply.title': 'La tua risposta',
  'reply.copy': '📋 Copia il messaggio',
  'reply.copied': '✓ Copiato',
  'reply.sourcesCited': '{count} fonti citate',
  'reply.sourcesCitedOne': '1 fonte citata',
  'reply.noSources': 'Nessuna fonte citata',
  'reply.linksRemoved': ' · {count} link non verificati rimossi',
  'reply.linksRemovedOne': ' · 1 link non verificato rimosso',
  'reply.toCheck': ' · {count} da verificare',
  'reply.claimWarn':
    'Il modello ha prodotto {count} link che non erano tra le fonti davvero recuperate. Sono stati tolti invece che mostrati, perché una citazione inventata è peggio di nessuna citazione.',
  'reply.claimWarnOne':
    'Il modello ha prodotto 1 link che non era tra le fonti davvero recuperate. È stato tolto invece che mostrato, perché una citazione inventata è peggio di nessuna citazione.',
  'reply.checkBeforeSending': 'Controlla prima di inviare',
  'reply.noSourcesRetrieved':
    'Per questa risposta non è stata recuperata nessuna fonte. Nessuna affermazione di fatto qui dentro è verificata: controlla tutto ciò su cui pensi di appoggiarti.',
  'reply.sourcesTitle': 'Fonti',

  // --- weak link + briefing --------------------------------------------------
  'weakLink.title': '⚠️ Prima di inviare — il punto debole della tua posizione',
  'briefing.title': "La tesi più forte dell'altra persona, e dove le rispondi",
  'briefing.tag': 'solo per te — da non inviare',
  'briefing.building': "Costruisco la tesi più forte dell'altra persona…",
  'briefing.answered': 'La tua risposta la affronta?',
  'briefing.unused': 'Recuperate ma non usate',

  // --- share -----------------------------------------------------------------
  'share.get': '🔗 Crea un link da condividere',
  'share.creating': 'Creo il link…',
  'share.copyLink': 'Copia il link',
  'share.caveat': "Pubblica questa argomentazione e la risposta, così chiunque abbia il link può leggerle",
  'share.help':
    "Chiunque abbia questo link può leggere l'argomentazione e la risposta. Non è elencato da nessuna parte, non è indicizzato e non si può trovare navigando, ma non è privato. I link scadono dopo un anno.",
  'share.banner': 'Qualcuno ha condiviso questa risposta con te',
  'share.generatedWith': 'Generata con {model}',
  'share.generatedWithAI': "Generata con l'AI",
  'share.theArgument': "L'argomentazione",
  'share.theReply': 'La risposta',
  'share.steelmanHeading': "Le ragioni più forti A FAVORE dell'argomentazione",
  'share.from': 'Da',
  'share.writeYourOwn': '✍️ Scrivi la tua risposta',
  'share.startFresh': 'Ricomincia da capo',

  // --- cost ------------------------------------------------------------------
  'cost.actual': 'Costo:',
  'cost.tokens': '({in} in ingresso / {out} in uscita)',
  'cost.tokensWithReasoning': '({in} in ingresso / {out} in uscita, {reasoning} di ragionamento)',
  'cost.sessionTotal': ' · totale della sessione {total}',

  // --- errors ----------------------------------------------------------------
  'error.needArgument': "Aggiungi prima l'argomentazione a cui vuoi rispondere",
  'error.needModel': 'Scegli un modello',
  'error.needKey': 'Inserisci una chiave API valida',
  'error.needKeyForModels': "Inserisci prima la tua chiave API: l'elenco dei modelli arriva dal provider.",
  'error.timeout': 'La richiesta è scaduta. Riprova.',
  'error.generic': 'Non è stato possibile scrivere la risposta',
  'error.refreshModels': "Non è stato possibile aggiornare l'elenco dei modelli",
  'error.briefing': "Non è stato possibile costruire la tesi dell'altra persona.",
  'error.publish': 'Non è stato possibile pubblicare questa risposta.',
  'error.loadShared': 'Non è stato possibile caricare la risposta condivisa.',
  'error.article': "Non è stato possibile caricare l'articolo. Prova a incollare il testo.",
  'error.searchUnavailable': 'La ricerca di prove non era disponibile.',
  'error.speechUnsupported': 'Questo browser non supporta il riconoscimento vocale. Usa Chrome, Edge o Safari.',
  'error.micDenied': "L'accesso al microfono è stato negato. Consenti il microfono per questo sito e riprova.",
  'error.micMissing': 'Non è stato trovato nessun microfono. Controlla che sia collegato e riprova.',
  'error.speechNetwork': 'Il servizio vocale ha avuto un errore di rete. Controlla la connessione e riprova.',

  // --- instant mode ----------------------------------------------------------
  'instant.working': 'Sto scrivendo la tua risposta (senza bisogno di chiavi)…',
  'instant.left': '{n} risposte gratuite rimaste per oggi',
  'instant.leftOne': '1 risposta gratuita rimasta per oggi',
  'instant.done.title': 'Le risposte gratuite per oggi sono finite',
  'instant.done.body':
    'Tornano disponibili alle {time}. Accedi per avere più risposte al giorno, oppure aggiungi la tua chiave API per risposte illimitate che non passano mai dai nostri server.',
  'instant.done.signIn': 'Accedi con Google',
  'instant.done.byok': 'Usa invece la mia chiave API',
  'instant.turnstile': 'Verifica non riuscita — ricarica la pagina e riprova.',
  'instant.error': 'La modalità istantanea non è disponibile in questo momento — riprova tra poco, oppure usa la tua chiave API.',
  'instant.badge': 'Modalità istantanea',

  // --- history ---------------------------------------------------------------
  'history.show': 'Cronologia',
  'history.hide': 'Nascondi cronologia',
  'history.empty': 'Ancora nessuna risposta salvata — ogni risposta che generi viene salvata qui, su questo dispositivo.',
  'history.localOnly':
    'Salvata solo su questo dispositivo. Accedi e sblocca la tua cassaforte per sincronizzarla, cifrata, su ogni dispositivo.',
  'history.synced': 'Cifrata e sincronizzata con il tuo account. Solo i tuoi dispositivi possono leggerla.',
  'history.delete': 'Elimina questa voce',
  'history.clear': 'Cancella tutta la cronologia',
  'history.clearConfirm': 'Eliminare tutte le risposte salvate? Viene cancellata anche la copia sincronizzata. Non si può annullare.',
}

export default it
