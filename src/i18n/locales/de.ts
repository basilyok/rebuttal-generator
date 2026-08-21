// German — a translation of en.ts. Keys are never translated, only values.
//
// REGISTER: consistent "du" throughout. "Sie" is the register of banks and
// enterprise software, and this app is one person helping another person write a
// private message. Every imperative here is the short, spoken form (füg, wähl,
// prüf) rather than the schoolbook -e form, for the same reason.
//
// "Passphrase" is rendered as "Passwort" everywhere: the point of those strings is
// that a non-technical person understands what they are choosing and what happens
// if they lose it.

const de = {
  // --- shell -----------------------------------------------------------------
  'app.title': '🎤 Rebuttal Generator',
  'app.subtitle': 'Schreib die Antwort, die wirklich umstimmt',
  'app.updateAvailable': '🎉 Es gibt eine neue Version!',
  'app.reload': 'Neu laden',

  // --- account ---------------------------------------------------------------
  'account.signIn': 'Anmelden',
  'account.signInOrUp': 'Anmelden / Registrieren',
  'account.benefitsTitle': 'Warum anmelden?',
  'account.benefitsKeys': 'Deine API-Schlüssel sind auf jedem Gerät dabei — verschlüsselt, sodass nur du sie lesen kannst.',
  'account.benefitsHistory': 'Auch dein Antwortverlauf wird synchronisiert — genauso verschlüsselt.',
  'account.benefitsQuota': 'Sechs kostenlose Sofort-Antworten pro Tag statt drei.',
  'account.benefitsLanguage': 'Deine Sprachwahl gilt überall, wo du dich anmeldest.',
  'account.signUpTitle': 'Dein Konto anlegen',
  'account.signInTitle': 'Anmelden',
  'account.continueWithGoogle': 'Weiter mit Google',
  'account.orDivider': 'oder',
  'account.username': 'Benutzername',
  'account.usernamePlaceholder': '3–32 Buchstaben, Zahlen, - oder _',
  'account.password': 'Passwort',
  'account.confirmPassword': 'Passwort bestätigen',
  'account.emailOptional': 'E-Mail (optional)',
  'account.noEmailWarning':
    'Ohne E-Mail kommst du nicht wieder rein, wenn du dieses Passwort einmal vergisst — es gibt nichts, womit es sich zurücksetzen ließe. Schreib es dir an einem sicheren Ort auf.',
  'account.createAccount': 'Konto anlegen',
  'account.signInAction': 'Anmelden',
  'account.switchToSignIn': 'Schon ein Konto? Anmelden',
  'account.switchToSignUp': 'Neu hier? Leg eins an',
  'account.passwordShort': 'Nimm mindestens 10 Zeichen.',
  'account.passwordMismatch': 'Die beiden Passwörter stimmen nicht überein.',
  'account.usernameInvalid': 'Benutzernamen haben 3–32 Zeichen: Buchstaben, Zahlen, - oder _.',
  'account.usernameTaken': 'Dieser Benutzername ist schon vergeben — probier einen anderen.',
  'account.badCredentials': 'Benutzername und Passwort passen nicht zusammen.',
  'account.rateLimited': 'Zu viele Versuche — warte ein paar Minuten und versuch es dann noch einmal.',
  'account.emailInvalid': 'Diese E-Mail-Adresse sieht nicht richtig aus.',
  'account.serverError': 'Bei uns ist etwas schiefgelaufen. Versuch es bitte gleich noch einmal.',
  'account.signOutFirst':
    'Das ist ein anderes Konto. Damit Konten getrennt bleiben, wurde dieses Gerät abgemeldet und der Verlauf auf diesem Gerät gelöscht — melde dich neu an, um weiterzumachen.',
  'account.authError': 'Die Anmeldung wurde nicht abgeschlossen. Versuch es bitte noch einmal.',
  'account.signInBlurb': 'Melde dich an, dann sind deine API-Schlüssel und deine Sprache auf allen Geräten da.',
  'account.signOut': 'Abmelden',
  'account.signedInAs': 'Angemeldet als {name}',
  'account.menu': 'Konto',
  'account.keysSynced': 'Schlüssel synchronisiert',
  'account.keysLocked': 'Schlüssel gesperrt',
  'account.unlock': 'Entsperren',
  'account.unlockTitle': 'Deine gespeicherten Schlüssel entsperren',
  'account.unlockBlurb':
    'Deine Schlüssel sind mit einem Passwort verschlüsselt, das dein Gerät nie verlässt — nicht einmal wir können sie lesen. Gib es auf diesem Gerät einmal ein.',
  'account.passphrase': 'Passwort',
  'account.passphrasePlaceholder': 'Das Passwort für deinen Schlüsseltresor',
  'account.unlockAction': 'Entsperren',
  'account.wrongPassphrase': 'Mit diesem Passwort ließen sich deine Schlüssel nicht entsperren. Versuch es noch einmal.',
  'account.setupTitle': 'Deine Schlüssel auf allen Geräten speichern',
  'account.setupBlurb':
    'Wähl ein Passwort. Deine API-Schlüssel werden damit schon hier im Browser verschlüsselt, bevor sie hochgeladen werden — auf dem Server liegt also nur unlesbarer Zeichensalat.',
  'account.setupWarning':
    'Dieses Passwort lässt sich nicht wiederherstellen. Wenn du es vergisst, gibst du einfach deine API-Schlüssel neu ein — mehr geht nicht verloren.',
  'account.confirmPassphrase': 'Passwort bestätigen',
  'account.passphraseMismatch': 'Die beiden Passwörter stimmen nicht überein.',
  'account.passphraseShort': 'Nimm mindestens 12 Zeichen — ein kurzes Passwort lässt sich offline erraten.',
  'account.passphraseLettersOnly': 'Nimm noch eine Zahl oder ein Sonderzeichen dazu, das macht es schwerer zu erraten.',
  'account.saveKeys': 'Verschlüsseln und speichern',
  'account.forgetKeys': 'Gespeicherte Schlüssel löschen',
  'account.forgetKeysConfirm':
    'Deine verschlüsselten Schlüssel vom Server löschen? In diesem Browser bleiben sie erhalten.',
  'account.notNow': 'Jetzt nicht',
  'account.syncing': 'Wird gespeichert…',
  'account.vaultSaved': 'Deine Schlüssel sind verschlüsselt und gespeichert.',

  // --- recovery --------------------------------------------------------------
  'recovery.title': 'Dein Wiederherstellungscode',
  'recovery.blurb':
    'Mit diesem Code kommst du wieder an deine gespeicherten Schlüssel und deinen Verlauf, falls du dein Passwort vergisst. Du siehst ihn nur dieses eine Mal — bewahr ihn also dort auf, wo du ihn später noch findest: in einem Passwort-Manager oder auf Papier.',
  'recovery.regenerateHint':
    'Solange du angemeldet bist, kannst du jederzeit einen neuen Code erzeugen — einen verlorenen Code zu ersetzen ist also lästig, aber kein Drama.',
  'recovery.copy': 'Code kopieren',
  'recovery.copied': 'Kopiert',
  'recovery.warning':
    'Wenn du dein Passwort und diesen Code beide verlierst, lassen sich deine gespeicherten API-Schlüssel und dein Verlauf nicht wiederherstellen — von uns nicht und von sonst niemandem.',
  'recovery.confirm': 'Ich habe diesen Code sicher aufbewahrt',
  'recovery.done': 'Fertig',
  'recovery.working': 'Wird eingerichtet…',
  'recovery.setupFailed':
    'Der Wiederherstellungscode ließ sich gerade nicht einrichten. Versuch es noch einmal, oder melde dich neu an, wenn es weiter nicht klappt.',
  'recovery.promptBody':
    'Du hast noch keinen Wiederherstellungscode. Ohne ihn bedeutet ein vergessenes Passwort, dass deine gespeicherten Schlüssel und dein Verlauf für immer weg sind.',
  'recovery.promptAction': 'Wiederherstellung einrichten',
  'recovery.promptDismiss': 'Jetzt nicht',
  'recovery.statusNone': 'Wiederherstellung einrichten',
  'recovery.statusFinishing': 'Wiederherstellung unfertig · abschließen',
  'recovery.statusReady': 'Wiederherstellung bereit · neuer Code',
  'recovery.statusUnknown': 'Wiederherstellung ungeprüft · neuer Code',
  'recovery.statusStale': 'Wiederherstellungscode womöglich ungültig · neuer Code',
  'recovery.resetTitle': 'Passwort zurücksetzen',
  'recovery.resetIntro': 'Gib deinen Benutzernamen und den Wiederherstellungscode ein, den du aufbewahrt hast.',
  'recovery.codeLabel': 'Wiederherstellungscode',
  'recovery.newPassword': 'Neues Passwort',
  'recovery.resetAction': 'Passwort zurücksetzen',
  'recovery.resetContinue': 'Weiter',
  'recovery.resetBack': 'Zurück',
  'recovery.resetWorking': 'Wird zurückgesetzt…',
  'recovery.resetFailed': 'Benutzername und Wiederherstellungscode passen nicht zusammen.',
  'recovery.resetCorrupt':
    'Der gespeicherte Wiederherstellungsdatensatz ist beschädigt und lässt sich nicht öffnen. Den Code erneut einzugeben hilft nicht.',
  'recovery.resetInterrupted':
    'Die Zurücksetzung wurde unterbrochen. Versuchen Sie, sich mit dem soeben gewählten neuen Passwort anzumelden — klappt das, ist die Zurücksetzung durchgelaufen. Andernfalls gilt weiterhin Ihr altes Passwort. Erzeugen Sie danach in jedem Fall einen neuen Wiederherstellungscode.',
  'recovery.resetBlocked':
    'Die Einrichtung der Wiederherstellung ist bei diesem Konto noch nicht fertig. Melde dich einmal mit deinem Passwort an, um sie abzuschließen.',
  'recovery.forgot': 'Passwort vergessen?',
  'recovery.leaveConfirm':
    'Dein Wiederherstellungscode steht noch auf dem Bildschirm und wird nicht wieder angezeigt. Weggehen, ohne ihn zu speichern?',
  'recovery.replacesOld': 'Das ersetzt jeden früheren Code — der bisherige funktioniert ab jetzt nicht mehr.',
  'recovery.rotateConfirm':
    'Einen neuen Wiederherstellungscode erzeugen? Dein aktueller Code funktioniert sofort nicht mehr, und du musst den neuen aufbewahren.',
  'recovery.promptLostBody':
    'Du hast einen Wiederherstellungscode, aber auf diesem Gerät wurde nie bestätigt, dass du ihn gespeichert hast — ging er verloren, bevor du ihn notiert hast, holt er dir dein Konto nicht zurück. Du kannst ihn jetzt durch einen neuen ersetzen.',
  'recovery.promptLostAction': 'Neuen Code erzeugen',

  // --- language --------------------------------------------------------------
  'language.label': 'Sprache',
  'language.switchToEnglish': 'Englisch',
  'language.choose': 'Sprache wählen',
  'language.followDevice': 'Wie auf meinem Gerät',

  // --- AI settings -----------------------------------------------------------
  'settings.chooseModel': 'Modell wählen',
  'settings.hide': 'Ausblenden',
  'settings.change': 'Ändern',
  'settings.provider': 'KI-Anbieter',
  'settings.model': 'Modell',
  'settings.refresh': '↻ Aktualisieren',
  'settings.refreshing': 'Wird aktualisiert…',
  'settings.refreshTitle': 'Die aktuelle Modellliste des Anbieters holen',
  'settings.useShortList': 'kurze Liste verwenden',
  'settings.useShortListTitle': 'Zurück zur kurzen, handverlesenen Liste',
  'settings.modelsUpdated': '{count} Modelle · aktualisiert {date}',
  'settings.apiKeyLabel': '{provider} API-Schlüssel',
  'settings.apiKeyPlaceholder': 'API-Schlüssel eingeben',
  'settings.saveKey': 'Schlüssel speichern',
  'settings.cancel': 'Abbrechen',
  'settings.changeKey': 'API-Schlüssel ändern',
  'settings.keyHelpFree':
    'Dieser Anbieter braucht auch für seine kostenlosen Modelle einen API-Schlüssel, aber das Anlegen ist gratis — Zahlungsdaten sind nicht nötig. ',
  'settings.keyHelpPaid':
    'Dein Schlüssel wird nur in diesem Browser gespeichert und nur an diesen Anbieter geschickt. Du musst ihn kein zweites Mal eingeben. ',
  'settings.keyHelpSynced':
    'Dein Schlüssel wird auf diesem Gerät verschlüsselt und mit deinem Konto synchronisiert, du musst ihn also auf keinem Gerät noch einmal eingeben. ',
  'settings.getOneFrom': 'Einen bekommst du bei',
  'settings.preferNoKey': 'Lieber ganz ohne Schlüssel? Wähl {option} in der Liste der KI-Anbieter.',
  'settings.localOption': 'Lokal im Browser (GRATIS, kein Schlüssel)',
  'settings.tavilyLabel': 'Schlüssel für die Belegsuche',
  'settings.optional': 'optional',
  'settings.save': 'Speichern',
  'settings.saved': '✓ Gespeichert',
  'settings.tavilyHelp':
    'Die Belegsuche funktioniert auch ganz ohne Schlüssel. Ein kostenloser Schlüssel von {link} (1.000 Suchen pro Monat, ohne Kreditkarte) hebt nur das Limit an, falls du je daran stößt.',
  'settings.costPerReply': '≈ {cost} pro Antwort',
  'settings.costIncludesReasoning': '≈ {cost} pro Antwort (inklusive verborgener Reasoning-Tokens)',
  'settings.costFreeLocal': 'Gratis — läuft auf deinem Gerät, es wird nichts berechnet',
  'settings.costUnknown': 'Für dieses Modell sind keine Preise bekannt',
  'settings.costFreeModel': 'Kostenloses Modell — keine Kosten',

  // --- input -----------------------------------------------------------------
  'input.label': 'Worauf antwortest du?',
  'input.modeGroup': 'Eingabeart',
  'input.modeText': '✍️ Sprechen oder tippen',
  'input.modeUrl': '🔗 Artikel-URL',
  'input.urlPlaceholder': 'https://example.com/der-artikel',
  'input.fetchArticle': 'Artikel holen',
  'input.fetching': 'Wird geholt…',
  'input.startRecording': '🎙 Aufnahme starten',
  'input.stopRecording': '⏹ Aufnahme stoppen',
  'input.recording': 'Aufnahme läuft…',
  'input.clear': 'Leeren',
  'input.placeholderText': 'Tipp das Argument hier ein oder diktier es mit „Aufnahme starten“…',
  'input.placeholderUrl':
    'Sobald der Artikel geladen ist, steht sein Text hier — du kannst ihn vorher noch bearbeiten.',
  'input.articleWords': '{count} Wörter',
  'input.articleViaArchive': ' · aus einer Kopie im Internet Archive gelesen',
  'input.articleTruncated': ' · gekürzt, damit die Anfrage klein bleibt',

  // --- audience --------------------------------------------------------------
  'audience.label': 'Wer hat das geschrieben, und wo?',
  'audience.optional': 'optional — ändert aber, wie die Antwort geschrieben wird',
  'audience.placeholder': 'z. B. mein Schwiegervater, per Nachricht · jemand Fremdes auf LinkedIn',
  'audience.help':
    'Lässt du das frei, wird es aus dem Text erschlossen. Wenn du sagst, wer die Person ist, kann die Antwort Quellen nutzen, denen sie ohnehin vertraut, und ihren Ton treffen.',

  // --- reply language --------------------------------------------------------
  'replyLang.detected': 'Antwort auf {language}',
  'replyLang.change': 'ändern',
  'replyLang.label': 'Antwort schreiben auf',
  'replyLang.help':
    'Die Antwort geht an die Person, die das Argument geschrieben hat, und richtet sich deshalb nach deren Sprache, nicht nach der Sprache der Oberfläche.',
  'replyLang.auto': 'Wie das Argument ({language})',

  // --- sources ---------------------------------------------------------------
  'sources.toggle': 'Echte Belege zum Zitieren suchen',
  'sources.hint':
    ' — sucht zuerst im Netz, und die Antwort darf nur zitieren, was dabei wirklich gefunden wurde. Funktioniert mit jedem Modell, ganz ohne Schlüssel.',

  // --- generate --------------------------------------------------------------
  'generate.submit': '✨ Meine Antwort schreiben',
  'generate.working': 'Wird geschrieben…',
  'generate.searching': 'Belege werden gesucht…',
  'generate.writing': 'Die Antwort wird geschrieben…',
  'generate.srStatus': 'Antwort wird erstellt',

  // --- reply -----------------------------------------------------------------
  'reply.title': 'Deine Antwort',
  'reply.copy': '📋 Nachricht kopieren',
  'reply.copied': '✓ Kopiert',
  'reply.sourcesCited': '{count} Quellen zitiert',
  'reply.sourcesCitedOne': '1 Quelle zitiert',
  'reply.noSources': 'Keine Quellen zitiert',
  'reply.linksRemoved': ' · {count} ungeprüfte Links entfernt',
  'reply.linksRemovedOne': ' · 1 ungeprüfter Link entfernt',
  'reply.toCheck': ' · {count} zu prüfen',
  'reply.claimWarn':
    'Das Modell hat {count} Links erzeugt, die nicht zu den tatsächlich gefundenen Quellen gehörten. Sie wurden entfernt statt dir gezeigt, denn eine erfundene Quellenangabe ist schlimmer als gar keine.',
  'reply.claimWarnOne':
    'Das Modell hat einen Link erzeugt, der nicht zu den tatsächlich gefundenen Quellen gehörte. Er wurde entfernt statt dir gezeigt, denn eine erfundene Quellenangabe ist schlimmer als gar keine.',
  'reply.checkBeforeSending': 'Vor dem Senden prüfen',
  'reply.noSourcesRetrieved':
    'Für diese Antwort wurden keine Quellen gefunden. Jede Tatsachenbehauptung darin ist ungeprüft — sieh alles nach, worauf du dich stützen willst.',
  'reply.sourcesTitle': 'Quellen',

  // --- weak link + briefing --------------------------------------------------
  'weakLink.title': '⚠️ Bevor du sendest — die schwache Stelle in deiner Position',
  'briefing.title': 'Das stärkste Argument der Gegenseite — und wo du darauf antwortest',
  'briefing.tag': 'nur für dich — nicht verschicken',
  'briefing.building': 'Das stärkste Argument der Gegenseite entsteht…',
  'briefing.answered': 'Beantwortet deine Antwort das?',
  'briefing.unused': 'Gefunden, aber nicht verwendet',

  // --- share -----------------------------------------------------------------
  'share.get': '🔗 Link zum Teilen erstellen',
  'share.creating': 'Link wird erstellt…',
  'share.copyLink': 'Link kopieren',
  'share.caveat': 'Veröffentlicht dieses Argument und die Antwort, sodass alle mit dem Link sie lesen können',
  'share.help':
    'Alle, die diesen Link haben, können das Argument und die Antwort lesen. Die Seite ist ungelistet — nicht in Suchmaschinen, nicht zum Stöbern —, aber sie ist nicht privat. Links laufen nach einem Jahr ab.',
  'share.banner': 'Jemand hat diese Antwort mit dir geteilt',
  'share.generatedWith': 'Erstellt mit {model}',
  'share.generatedWithAI': 'Mit KI erstellt',
  'share.theArgument': 'Das Argument',
  'share.theReply': 'Die Antwort',
  'share.steelmanHeading': 'Die stärkste Begründung FÜR das Argument',
  'share.from': 'Von',
  'share.writeYourOwn': '✍️ Eigene Antwort schreiben',
  'share.startFresh': 'Neu anfangen',

  // --- cost ------------------------------------------------------------------
  'cost.actual': 'Kosten:',
  'cost.tokens': '({in} Eingabe / {out} Ausgabe)',
  'cost.tokensWithReasoning': '({in} Eingabe / {out} Ausgabe, {reasoning} Reasoning)',
  'cost.sessionTotal': ' · Sitzung gesamt {total}',

  // --- errors ----------------------------------------------------------------
  'error.needArgument': 'Füg zuerst das Argument ein, auf das du antworten willst',
  'error.needModel': 'Bitte wähl ein Modell',
  'error.needKey': 'Bitte gib einen gültigen API-Schlüssel ein',
  'error.needKeyForModels': 'Gib zuerst deinen API-Schlüssel ein — die Modellliste kommt vom Anbieter.',
  'error.timeout': 'Die Anfrage hat zu lange gedauert. Versuch es bitte noch einmal.',
  'error.generic': 'Die Antwort konnte nicht geschrieben werden',
  'error.refreshModels': 'Die Modellliste konnte nicht aktualisiert werden',
  'error.briefing': 'Das Argument der Gegenseite konnte nicht erstellt werden.',
  'error.publish': 'Diese Antwort konnte nicht veröffentlicht werden.',
  'error.loadShared': 'Diese geteilte Antwort konnte nicht geladen werden.',
  'error.article': 'Der Artikel konnte nicht geladen werden. Füg den Text am besten direkt ein.',
  'error.searchUnavailable': 'Die Belegsuche war nicht erreichbar.',
  'error.speechUnsupported': 'Dieser Browser unterstützt keine Spracherkennung. Nimm bitte Chrome, Edge oder Safari.',
  'error.micDenied': 'Der Zugriff aufs Mikrofon wurde abgelehnt. Erlaub ihn für diese Seite und versuch es noch einmal.',
  'error.micMissing': 'Es wurde kein Mikrofon gefunden. Prüf, ob eines angeschlossen ist, und versuch es noch einmal.',
  'error.speechNetwork': 'Beim Spracherkennungsdienst gab es einen Netzwerkfehler. Prüf deine Verbindung und versuch es noch einmal.',

  // --- instant mode ----------------------------------------------------------
  'instant.working': 'Deine Antwort wird geschrieben (kein Schlüssel nötig)…',
  'instant.left': 'Noch {n} kostenlose Antworten heute',
  'instant.leftOne': 'Noch 1 kostenlose Antwort heute',
  'instant.done.title': 'Die kostenlosen Antworten sind für heute aufgebraucht',
  'instant.done.body':
    'Sie kommen um {time} zurück. Melde dich an, dann hast du ein größeres Tageskontingent, oder füg deinen eigenen API-Schlüssel hinzu für unbegrenzte Antworten, die nie über unsere Server laufen.',
  'instant.done.byok': 'Stattdessen meinen eigenen API-Schlüssel verwenden',
  'instant.turnstile': 'Überprüfung fehlgeschlagen — lad die Seite neu und versuch es noch einmal.',
  'instant.error': 'Der Sofortmodus ist gerade nicht verfügbar — versuch es gleich noch einmal, oder nutze deinen eigenen API-Schlüssel.',
  'instant.badge': 'Sofortmodus',

  // --- history ---------------------------------------------------------------
  'history.show': 'Verlauf',
  'history.hide': 'Verlauf ausblenden',
  'history.empty': 'Noch keine gespeicherten Antworten — jede Antwort, die du erstellst, wird hier auf diesem Gerät gespeichert.',
  'history.localOnly':
    'Nur auf diesem Gerät gespeichert. Melde dich an und entsperre deinen Schlüsseltresor, um sie verschlüsselt auf allen Geräten zu synchronisieren.',
  'history.synced': 'Verschlüsselt und mit deinem Konto synchronisiert. Nur deine Geräte können sie lesen.',
  'history.delete': 'Diesen Eintrag löschen',
  'history.clear': 'Gesamten Verlauf löschen',
  'history.clearConfirm': 'Alle gespeicherten Antworten löschen? Die synchronisierte Kopie wird ebenfalls gelöscht. Das lässt sich nicht rückgängig machen.',
}

export default de
