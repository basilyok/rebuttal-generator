// Spanish — translated from locales/en.ts.
//
// TRANSLATOR NOTES
// - Register: "tú" throughout. This is one adult writing to another, not a company
//   writing to a customer; "usted" would make the interface sound like a bank.
// - Vocabulary kept neutral between Spain and Latin America: no "vosotros", no
//   compound past where the preterite reads the same everywhere.
// - "passphrase" is rendered as "contraseña maestra" so nobody confuses it with the
//   password of the Google account they just signed in with.
// - Product and provider names stay in English.

const es = {
  // --- shell -----------------------------------------------------------------
  'app.title': '🎤 Rebuttal Generator',
  'app.subtitle': 'Escribe la respuesta que de verdad le hace cambiar de opinión',
  'app.updateAvailable': '🎉 ¡Hay una versión nueva!',
  'app.reload': 'Recargar',

  // --- account ---------------------------------------------------------------
  'account.signIn': 'Iniciar sesión',
  'account.signInBlurb': 'Inicia sesión para conservar tus claves API y tu idioma en todos tus dispositivos.',
  'account.signOut': 'Cerrar sesión',
  'account.signedInAs': 'Sesión iniciada como {name}',
  'account.menu': 'Cuenta',
  'account.keysSynced': 'Claves sincronizadas',
  'account.keysLocked': 'Claves bloqueadas',
  'account.unlock': 'Desbloquear',
  'account.unlockTitle': 'Desbloquea tus claves guardadas',
  'account.unlockBlurb':
    'Tus claves están cifradas con una contraseña maestra que nunca sale de tu dispositivo: ni siquiera nosotros podemos leerlas. Escríbela una vez en este dispositivo.',
  'account.passphrase': 'Contraseña maestra',
  'account.passphrasePlaceholder': 'Tu contraseña maestra',
  'account.unlockAction': 'Desbloquear',
  'account.wrongPassphrase': 'Esa contraseña no desbloqueó tus claves. Inténtalo de nuevo.',
  'account.setupTitle': 'Guarda tus claves en todos tus dispositivos',
  'account.setupBlurb':
    'Elige una contraseña maestra. Tus claves API se cifran con ella aquí, en este navegador, antes de subirse, así que el servidor solo llega a guardar un texto revuelto que no puede leer.',
  'account.setupWarning':
    'No hay ninguna forma de recuperar esta contraseña. Si la olvidas, solo tienes que volver a escribir tus claves API: no se pierde nada más.',
  'account.confirmPassphrase': 'Confirma la contraseña maestra',
  'account.passphraseMismatch': 'Las dos contraseñas no coinciden.',
  'account.passphraseShort': 'Usa al menos 12 caracteres: una contraseña corta se puede adivinar probando combinaciones.',
  'account.passphraseLettersOnly': 'Añade un número o un símbolo para que sea más difícil de adivinar.',
  'account.saveKeys': 'Cifrar y guardar',
  'account.forgetKeys': 'Borrar las claves guardadas',
  'account.forgetKeysConfirm': '¿Borrar tus claves cifradas del servidor? Las claves seguirán en este navegador.',
  'account.notNow': 'Ahora no',
  'account.syncing': 'Guardando…',
  'account.vaultSaved': 'Tus claves están cifradas y guardadas.',
  'account.signInOrUp': 'Iniciar sesión / Crear cuenta',
  'account.benefitsTitle': '¿Por qué iniciar sesión?',
  'account.benefitsKeys': 'Tus claves API te siguen a cualquier dispositivo — cifradas para que solo tú puedas leerlas.',
  'account.benefitsHistory': 'Tu historial de respuestas también se sincroniza, cifrado de la misma forma.',
  'account.benefitsQuota': 'Seis respuestas instantáneas gratis al día en lugar de tres.',
  'account.benefitsLanguage': 'El idioma que elijas se mantiene en cualquier sitio donde inicies sesión.',
  'account.signUpTitle': 'Crea tu cuenta',
  'account.signInTitle': 'Iniciar sesión',
  'account.continueWithGoogle': 'Continuar con Google',
  'account.orDivider': 'o',
  'account.username': 'Nombre de usuario',
  'account.usernamePlaceholder': '3–32 letras, números, - o _',
  'account.password': 'Contraseña',
  'account.confirmPassword': 'Confirma la contraseña',
  'account.emailOptional': 'Correo electrónico (opcional)',
  'account.noEmailWarning':
    'Sin correo no hay forma de volver a entrar si algún día olvidas esta contraseña: no hay nada con lo que restablecerla. Apúntala en un lugar seguro.',
  'account.createAccount': 'Crear cuenta',
  'account.signInAction': 'Iniciar sesión',
  'account.switchToSignIn': '¿Ya tienes una cuenta? Inicia sesión',
  'account.switchToSignUp': '¿Primera vez por aquí? Crea una cuenta',
  'account.passwordShort': 'Usa al menos 10 caracteres.',
  'account.passwordMismatch': 'Las dos contraseñas no coinciden.',
  'account.usernameInvalid': 'Los nombres de usuario tienen 3–32 caracteres: letras, números, - o _.',
  'account.usernameTaken': 'Ese nombre de usuario ya está en uso: prueba con otro.',
  'account.badCredentials': 'Ese nombre de usuario y esa contraseña no coinciden.',
  'account.rateLimited': 'Demasiados intentos: espera unos minutos e inténtalo de nuevo.',
  'account.emailInvalid': 'Esa dirección de correo no parece válida.',
  'account.serverError': 'Algo salió mal de nuestra parte. Inténtalo de nuevo en un momento.',
  'account.signOutFirst':
    'Esa es otra cuenta. Para mantener las cuentas separadas, se cerró la sesión en este dispositivo y se borró el historial guardado en él: inicia sesión de nuevo para continuar.',
  'account.authError': 'El inicio de sesión no se completó. Inténtalo de nuevo.',

  // --- recovery --------------------------------------------------------------
  'recovery.title': 'Tu código de recuperación',
  'recovery.blurb':
    'Este código es lo que te devuelve el acceso a tus claves y tu historial guardados si algún día olvidas tu contraseña. Solo lo verás esta vez, así que guárdalo en un sitio donde lo sigas teniendo más adelante: un gestor de contraseñas, o en papel.',
  'recovery.regenerateHint':
    'Puedes generar un código nuevo cuando quieras mientras tengas la sesión iniciada, así que perder uno es una molestia, no un desastre.',
  'recovery.copy': 'Copiar código',
  'recovery.copied': 'Copiado',
  'recovery.warning':
    'Si pierdes tu contraseña y también este código, tus claves de API y tu historial guardados no se pueden recuperar: ni por nosotros, ni por nadie.',
  'recovery.confirm': 'He guardado este código en un lugar seguro',
  'recovery.done': 'Listo',
  'recovery.working': 'Configurando…',
  'recovery.setupFailed':
    'No se ha podido configurar tu código de recuperación ahora mismo. Inténtalo de nuevo, o vuelve a iniciar sesión si sigue pasando.',
  'recovery.promptBody':
    'Todavía no tienes un código de recuperación. Sin él, olvidar tu contraseña significa perder para siempre tus claves y tu historial guardados.',
  'recovery.promptAction': 'Configurar la recuperación',
  'recovery.promptDismiss': 'Ahora no',
  'recovery.statusNone': 'Configurar la recuperación',
  'recovery.statusFinishing': 'Recuperación sin terminar · terminarla',
  'recovery.statusReady': 'Recuperación lista · código nuevo',
  'recovery.statusUnknown': 'Recuperación sin comprobar · código nuevo',
  'recovery.statusStale': 'El código de recuperación quizá no sirva · código nuevo',
  'recovery.resetTitle': 'Restablece tu contraseña',
  'recovery.resetIntro': 'Escribe tu nombre de usuario y el código de recuperación que guardaste.',
  'recovery.codeLabel': 'Código de recuperación',
  'recovery.newPassword': 'Contraseña nueva',
  'recovery.resetAction': 'Restablecer contraseña',
  'recovery.resetContinue': 'Continuar',
  'recovery.resetBack': 'Atrás',
  'recovery.resetWorking': 'Restableciendo…',
  'recovery.resetFailed': 'Ese nombre de usuario y ese código de recuperación no coinciden.',
  'recovery.resetCorrupt':
    'El registro de recuperación guardado está dañado y no se puede abrir. Volver a introducir el código no servirá de nada.',
  'recovery.resetInterrupted':
    'Algo interrumpió el restablecimiento. Prueba a iniciar sesión con la nueva contraseña que acabas de elegir: si funciona, el restablecimiento se completó. Si no, tu contraseña anterior sigue siendo válida. En cualquier caso, genera después un código de recuperación nuevo.',
  'recovery.resetBlocked':
    'La configuración de la recuperación aún no ha terminado en esta cuenta. Inicia sesión una vez con tu contraseña para terminarla.',
  'recovery.forgot': '¿Olvidaste tu contraseña?',
  'recovery.leaveConfirm':
    'Tu código de recuperación sigue en pantalla y no volverá a mostrarse. ¿Salir sin guardarlo?',
  'recovery.replacesOld': 'Esto sustituye a cualquier código anterior: el que tenías deja de funcionar ahora mismo.',
  'recovery.rotateConfirm':
    '¿Generar un código de recuperación nuevo? Tu código actual dejará de funcionar de inmediato y tendrás que guardar el nuevo.',
  'recovery.promptLostBody':
    'Tienes un código de recuperación, pero en este dispositivo nunca se ha confirmado que lo guardaras: si se perdió antes de que lo anotaras, no te devolverá la cuenta. Puedes sustituirlo por uno nuevo ahora.',
  'recovery.promptLostAction': 'Generar un código nuevo',

  // --- language --------------------------------------------------------------
  'language.label': 'Idioma',
  'language.switchToEnglish': 'English',
  'language.choose': 'Elige un idioma',
  'language.followDevice': 'Usar el idioma de mi dispositivo',

  // --- AI settings -----------------------------------------------------------
  'settings.chooseModel': 'Elige un modelo',
  'settings.hide': 'Ocultar',
  'settings.change': 'Cambiar',
  'settings.provider': 'Proveedor de IA',
  'settings.model': 'Modelo',
  'settings.refresh': '↻ Actualizar',
  'settings.refreshing': 'Actualizando…',
  'settings.refreshTitle': 'Traer la lista de modelos actual del proveedor',
  'settings.useShortList': 'usar la lista corta',
  'settings.useShortListTitle': 'Volver a la lista corta, elegida a mano',
  'settings.modelsUpdated': '{count} modelos · actualizada {date}',
  'settings.apiKeyLabel': 'Clave API de {provider}',
  'settings.apiKeyPlaceholder': 'Escribe tu clave API',
  'settings.saveKey': 'Guardar la clave',
  'settings.cancel': 'Cancelar',
  'settings.changeKey': 'Cambiar la clave API',
  'settings.keyHelpFree':
    'Este proveedor pide una clave API incluso para sus modelos gratuitos, pero crearla no cuesta nada: no hace falta dar datos de pago. ',
  'settings.keyHelpPaid':
    'Tu clave se guarda solo en este navegador y solo se envía a este proveedor. No tendrás que volver a escribirla. ',
  'settings.keyHelpSynced':
    'Tu clave se cifra en este dispositivo y se sincroniza con tu cuenta, así que no tendrás que volver a escribirla en ningún dispositivo. ',
  'settings.getOneFrom': 'Consigue una en',
  'settings.preferNoKey': '¿Prefieres no usar ninguna clave? Elige {option} en el menú de Proveedor de IA.',
  'settings.localOption': 'Local, en el navegador (GRATIS, sin clave)',
  'settings.tavilyLabel': 'Clave de búsqueda de pruebas',
  'settings.optional': 'opcional',
  'settings.save': 'Guardar',
  'settings.saved': '✓ Guardado',
  'settings.tavilyHelp':
    'La búsqueda de pruebas ya funciona sin ninguna clave. Una clave gratuita de {link} (1000 búsquedas al mes, sin tarjeta) solo sube el límite, por si llegas a alcanzarlo.',
  'settings.costPerReply': '≈ {cost} por respuesta',
  'settings.costIncludesReasoning': '≈ {cost} por respuesta (incluye los tokens de razonamiento ocultos)',
  'settings.costFreeLocal': 'Gratis: funciona en tu dispositivo, no se cobra nada',
  'settings.costUnknown': 'No se conoce el precio de este modelo',
  'settings.costFreeModel': 'Modelo gratuito: sin cargo',

  // --- input -----------------------------------------------------------------
  'input.label': '¿A qué quieres responder?',
  'input.modeGroup': 'Modo de entrada',
  'input.modeText': '✍️ Habla o escribe',
  'input.modeUrl': '🔗 URL del artículo',
  'input.urlPlaceholder': 'https://ejemplo.com/el-articulo',
  'input.fetchArticle': 'Cargar el artículo',
  'input.fetching': 'Cargando…',
  'input.startRecording': '🎙 Empezar a grabar',
  'input.stopRecording': '⏹ Detener la grabación',
  'input.recording': 'Grabando…',
  'input.clear': 'Borrar',
  'input.placeholderText': 'Escribe aquí el argumento, o usa el botón de grabar para dictarlo…',
  'input.placeholderUrl': 'El texto del artículo aparecerá aquí en cuanto se cargue; puedes editarlo antes de generar la respuesta.',
  'input.articleWords': '{count} palabras',
  'input.articleViaArchive': ' · leído desde una copia guardada en Internet Archive',
  'input.articleTruncated': ' · recortado para que la petición sea más ligera',

  // --- audience --------------------------------------------------------------
  'audience.label': '¿Quién lo escribió, y dónde?',
  'audience.optional': 'opcional, pero cambia mucho cómo se escribe la respuesta',
  'audience.placeholder': 'p. ej. mi suegro, por mensajes · alguien a quien no conozco, en LinkedIn',
  'audience.help':
    'Si lo dejas en blanco, se deduce del propio texto. Decir quién es permite que la respuesta use fuentes en las que esa persona ya confía y hable como habla ella.',

  // --- reply language --------------------------------------------------------
  'replyLang.detected': 'Respondiendo en {language}',
  'replyLang.change': 'cambiar',
  'replyLang.label': 'Escribir la respuesta en',
  'replyLang.help': 'La respuesta va dirigida a quien escribió el argumento, así que sigue su idioma, no el de la interfaz.',
  'replyLang.auto': 'El mismo del argumento ({language})',

  // --- sources ---------------------------------------------------------------
  'sources.toggle': 'Buscar pruebas reales que citar',
  'sources.hint':
    ' — busca primero en la web, y la respuesta solo puede citar lo que se encontró de verdad. Funciona con cualquier modelo y sin ninguna clave.',

  // --- generate --------------------------------------------------------------
  'generate.submit': '✨ Escribir mi respuesta',
  'generate.working': 'Escribiendo…',
  'generate.searching': 'Buscando pruebas…',
  'generate.writing': 'Escribiendo la respuesta…',
  'generate.srStatus': 'Generando la réplica',

  // --- reply -----------------------------------------------------------------
  'reply.title': 'Tu respuesta',
  'reply.copy': '📋 Copiar el mensaje',
  'reply.copied': '✓ Copiado',
  'reply.sourcesCited': '{count} fuentes citadas',
  'reply.sourcesCitedOne': '1 fuente citada',
  'reply.noSources': 'Ninguna fuente citada',
  'reply.linksRemoved': ' · {count} enlaces sin verificar eliminados',
  'reply.linksRemovedOne': ' · 1 enlace sin verificar eliminado',
  'reply.toCheck': ' · {count} por comprobar',
  'reply.claimWarn':
    'El modelo generó {count} enlaces que no estaban entre las fuentes que se encontraron de verdad. Se eliminaron en lugar de mostrártelos, porque una cita inventada es peor que ninguna.',
  'reply.claimWarnOne':
    'El modelo generó 1 enlace que no estaba entre las fuentes que se encontraron de verdad. Se eliminó en lugar de mostrártelo, porque una cita inventada es peor que ninguna.',
  'reply.checkBeforeSending': 'Revísalo antes de enviar',
  'reply.noSourcesRetrieved':
    'No se encontró ninguna fuente para esta respuesta. Ningún dato que aparezca en ella está verificado: comprueba todo aquello en lo que pienses apoyarte.',
  'reply.sourcesTitle': 'Fuentes',

  // --- weak link + briefing --------------------------------------------------
  'weakLink.title': '⚠️ Antes de enviar: el punto débil de tu postura',
  'briefing.title': 'Su mejor argumento, y dónde lo respondes',
  'briefing.tag': 'solo para ti — no lo envíes',
  'briefing.building': 'Construyendo su argumento más fuerte…',
  'briefing.answered': '¿Tu respuesta lo contesta?',
  'briefing.unused': 'Encontradas pero sin usar',

  // --- share -----------------------------------------------------------------
  'share.get': '🔗 Crear un enlace para compartir',
  'share.creating': 'Creando el enlace…',
  'share.copyLink': 'Copiar el enlace',
  'share.caveat': 'Publica este argumento y esta réplica para que cualquiera con el enlace pueda leerlos',
  'share.help':
    'Cualquiera que tenga este enlace puede leer el argumento y la réplica. No aparece en ningún listado, ni se indexa ni se puede encontrar navegando, pero no es privado. Los enlaces caducan al cabo de un año.',
  'share.banner': 'Alguien compartió esta respuesta contigo',
  'share.generatedWith': 'Generado con {model}',
  'share.generatedWithAI': 'Generado con IA',
  'share.theArgument': 'El argumento',
  'share.theReply': 'La respuesta',
  'share.steelmanHeading': 'La defensa más fuerte A FAVOR del argumento',
  'share.from': 'De',
  'share.writeYourOwn': '✍️ Escribe tu propia respuesta',
  'share.startFresh': 'Empezar de cero',

  // --- cost ------------------------------------------------------------------
  'cost.actual': 'Coste:',
  'cost.tokens': '({in} de entrada / {out} de salida)',
  'cost.tokensWithReasoning': '({in} de entrada / {out} de salida, {reasoning} de razonamiento)',
  'cost.sessionTotal': ' · total de la sesión {total}',

  // --- errors ----------------------------------------------------------------
  'error.needArgument': 'Primero añade el argumento al que quieres responder',
  'error.needModel': 'Elige un modelo',
  'error.needKey': 'Escribe una clave API válida',
  'error.needKeyForModels': 'Escribe primero tu clave API: la lista de modelos viene del proveedor.',
  'error.timeout': 'La petición tardó demasiado. Inténtalo de nuevo.',
  'error.generic': 'No se pudo escribir la respuesta',
  'error.refreshModels': 'No se pudo actualizar la lista de modelos',
  'error.briefing': 'No se pudo construir su argumento.',
  'error.publish': 'No se pudo publicar esta réplica.',
  'error.loadShared': 'No se pudo cargar esa réplica compartida.',
  'error.article': 'No se pudo cargar ese artículo. Prueba a pegar el texto.',
  'error.searchUnavailable': 'La búsqueda de pruebas no estuvo disponible.',
  'error.speechUnsupported': 'Este navegador no admite el reconocimiento de voz. Usa Chrome, Edge o Safari.',
  'error.micDenied': 'Se denegó el acceso al micrófono. Permite el acceso al micrófono en este sitio e inténtalo de nuevo.',
  'error.micMissing': 'No se encontró ningún micrófono. Comprueba que haya uno conectado e inténtalo de nuevo.',
  'error.speechNetwork': 'El servicio de voz tuvo un error de red. Revisa tu conexión e inténtalo de nuevo.',

  // --- instant mode ------------------------------------------------------------
  'instant.working': 'Escribiendo tu respuesta (sin necesidad de clave)…',
  'instant.left': 'Te quedan {n} respuestas gratis hoy',
  'instant.leftOne': 'Te queda 1 respuesta gratis hoy',
  'instant.done.title': 'Se acabaron las respuestas gratis por hoy',
  'instant.done.body':
    'Vuelven a las {time}. Inicia sesión para tener más respuestas gratis cada día, o añade tu propia clave API para respuestas ilimitadas que nunca pasan por nuestros servidores.',
  'instant.done.byok': 'Usar mi propia clave API en su lugar',
  'instant.turnstile': 'La verificación falló: recarga la página e inténtalo de nuevo.',
  'instant.error': 'El modo instantáneo no está disponible ahora mismo: inténtalo de nuevo en un momento, o usa tu propia clave API.',
  'instant.badge': 'Modo instantáneo',

  // --- history ---------------------------------------------------------------
  'history.show': 'Historial',
  'history.hide': 'Ocultar el historial',
  'history.empty': 'Todavía no hay respuestas guardadas — cada respuesta que generas se guarda aquí, en este dispositivo.',
  'history.localOnly':
    'Guardado solo en este dispositivo. Inicia sesión y desbloquea tu bóveda para sincronizarlo, cifrado, en todos tus dispositivos.',
  'history.synced': 'Cifrado y sincronizado con tu cuenta. Solo tus dispositivos pueden leerlo.',
  'history.delete': 'Borrar esta entrada',
  'history.clear': 'Borrar todo el historial',
  'history.clearConfirm': '¿Borrar todas las respuestas guardadas? La copia sincronizada también se borra. Esto no se puede deshacer.',
}

export default es
